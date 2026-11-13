// Orquestrador: decide o que fazer com cada pedido do WooCommerce.
//
// É chamado pelo webhook (na hora que o pedido muda) e pelo cron (rede de segurança).
// Cada passo grava uma marca no pedido (metadados _sv_*), então rodar duas vezes
// nunca duplica nada: pedido no Bling, etiqueta ou mensagem só acontecem uma vez.
import * as bling from './bling';
import { config, integracoes } from './config';
import { adquirirTrava, liberarTrava } from './kv';
import * as melhorEnvio from './melhorenvio';
import { enviarCompra } from './meta';
import { alertaErroPedido, alertaPagamentoRecusado, alertaVenda } from './alertas';
import { alertarLoja, avisarCliente, escapar } from './notificacoes';
import { adicionarNota, linkPagamento, listarPedidos, meta, obterPedido, salvarNoPedido, WcPedido } from './woocommerce';

export const M = {
  avisoRecebido: '_sv_aviso_recebido',
  avisoPago: '_sv_aviso_pago',
  avisoEnviado: '_sv_aviso_enviado',
  avisoPix: '_sv_aviso_pix',
  alertaLoja: '_sv_alerta_loja',
  metaCompra: '_sv_meta_compra',
  blingPedido: '_sv_bling_pedido_id',
  blingNfe: '_sv_bling_nfe_id',
  nfeEnviada: '_sv_bling_nfe_enviada',
  nfeChave: '_sv_nfe_chave',
  meEnvio: '_sv_melhorenvio_envio_id',
  meEtiqueta: '_sv_melhorenvio_etiqueta',
  rastreio: '_sv_rastreio',
  erro: '_sv_erro',
} as const;

const STATUS_PAGO = ['processing', 'completed'];
const IDADE_MAXIMA_DIAS = 15; // pedidos mais antigos que isso não são mexidos

export type Relatorio = { pedido: number; status: string; feito: string[]; erros: string[]; ignorado?: string };

function idadeEmDias(pedido: WcPedido): number {
  return (Date.now() - new Date(pedido.date_created_gmt + 'Z').getTime()) / 86_400_000;
}

function codigoRastreioManual(pedido: WcPedido): string | undefined {
  // Permite informar o rastreio à mão no pedido (campo personalizado _sv_rastreio)
  // ou via plugin "Claudio Sanches – Correios for WooCommerce".
  return meta(pedido, M.rastreio) || meta(pedido, '_correios_tracking_code');
}

export async function processarPedido(id: number, opcoes: { rastreioMelhorEnvio?: string } = {}): Promise<Relatorio> {
  const rel: Relatorio = { pedido: id, status: '', feito: [], erros: [] };

  if (!(await adquirirTrava(`pedido:${id}`, 120))) {
    rel.ignorado = 'já está sendo processado';
    return rel;
  }

  try {
    const pedido = await obterPedido(id);
    rel.status = pedido.status;

    if (idadeEmDias(pedido) > IDADE_MAXIMA_DIAS) {
      rel.ignorado = `pedido com mais de ${IDADE_MAXIMA_DIAS} dias`;
      return rel;
    }

    const passo = async (nome: string, fn: () => Promise<string | void>) => {
      try {
        const r = await fn();
        if (r) rel.feito.push(`${nome}: ${r}`);
      } catch (e) {
        rel.erros.push(`${nome}: ${(e as Error).message}`);
      }
    };

    // 0) Pagamento recusado: avisa o dono (uma vez por pedido)
    if (pedido.status === 'failed') await alertaPagamentoRecusado(pedido);

    // 1) Pedido recebido (aguardando pagamento)
    if (pedido.status === 'pending' && config.avisos.recebido && !meta(pedido, M.avisoRecebido)) {
      await passo('aviso recebido', async () => {
        const canais = await avisarCliente('recebido', pedido);
        await salvarNoPedido(pedido, { [M.avisoRecebido]: canais.join(',') || 'nenhum canal' });
        return canais.join(',') || undefined;
      });
    }

    if (STATUS_PAGO.includes(pedido.status)) {
      // 2) Pagamento aprovado → avisa cliente e loja
      if (!meta(pedido, M.avisoPago)) {
        await passo('aviso pago', async () => {
          const canais = await avisarCliente('pago', pedido);
          await salvarNoPedido(pedido, { [M.avisoPago]: canais.join(',') || 'nenhum canal' });
          return canais.join(',') || undefined;
        });
      }
      if (!meta(pedido, M.alertaLoja)) {
        await passo('alerta loja', async () => {
          // Dados vêm do checkout (digitados pelo cliente): escapados antes de ir para o e-mail.
          const e = escapar;
          const itens = pedido.line_items.map((i) => `<li>${i.quantity}x ${e(i.name)} (${e(i.sku || 'sem SKU')})</li>`).join('');
          const b = pedido.billing;
          await alertarLoja(
            `Novo pedido pago #${pedido.id} — R$ ${pedido.total}`,
            `<p><b>${e(`${b.first_name} ${b.last_name}`)}</b> · ${e(b.phone || '')} · ${e(b.email || '')}</p><ul>${itens}</ul><p>Frete: ${e(pedido.shipping_lines?.[0]?.method_title || '-')} (R$ ${e(pedido.shipping_total)})</p>`
          );
          await salvarNoPedido(pedido, { [M.alertaLoja]: new Date().toISOString() });
          // Celular do dono (Telegram/WhatsApp), se o aviso de venda estiver ligado no painel
          await alertaVenda(pedido);
        });
      }

      // Meta Ads: compra pela API de Conversões
      if (integracoes.meta() && !meta(pedido, M.metaCompra)) {
        await passo('meta compra', async () => {
          const eventId = await enviarCompra(pedido);
          await salvarNoPedido(pedido, { [M.metaCompra]: eventId });
          return eventId;
        });
      }

      // 3) Bling: pedido de venda
      if (integracoes.bling() && config.bling.enviarPedidos && !meta(pedido, M.blingPedido)) {
        await passo('bling pedido', async () => {
          const r = await bling.criarPedidoVenda(pedido);
          await salvarNoPedido(pedido, { [M.blingPedido]: r.id });
          const avisos = r.avisos.length ? ` Atenção: ${r.avisos.join('; ')}.` : '';
          await adicionarNota(
            pedido,
            `Pedido de venda ${r.jaExistia ? 'encontrado' : 'criado'} no Bling (ID ${r.id}${r.numero ? `, nº ${r.numero}` : ''}).${avisos}`
          );
          return String(r.id);
        });
      }

      // 4) Bling: NF-e. Gerar e enviar são passos separados e o ID da nota é gravado antes
      //    do envio, para que uma falha no envio nunca gere uma segunda nota.
      const idPedidoBling = Number(meta(pedido, M.blingPedido));
      if (integracoes.bling() && config.bling.emitirNfe && idPedidoBling && !meta(pedido, M.blingNfe)) {
        await passo('nfe gerar', async () => {
          const idNota = await bling.gerarNfe(idPedidoBling);
          await salvarNoPedido(pedido, { [M.blingNfe]: idNota });
          await adicionarNota(pedido, `NF-e gerada no Bling a partir do pedido de venda (ID ${idNota}).`);
          return String(idNota);
        });
      }
      const idNota = Number(meta(pedido, M.blingNfe));
      if (integracoes.bling() && idNota && !meta(pedido, M.nfeChave)) {
        await passo('nfe', async () => {
          let nota = await bling.consultarNfe(idNota);
          if (nota.situacao === 1 && !meta(pedido, M.nfeEnviada)) {
            await bling.enviarNfe(idNota);
            await salvarNoPedido(pedido, { [M.nfeEnviada]: new Date().toISOString() });
            nota = await bling.consultarNfe(idNota);
          }
          if (nota.autorizada && nota.chaveAcesso) {
            await salvarNoPedido(pedido, { [M.nfeChave]: nota.chaveAcesso });
            await adicionarNota(pedido, `NF-e${nota.numero ? ` nº ${nota.numero}` : ''} autorizada. Chave: ${nota.chaveAcesso}`);
            return nota.chaveAcesso;
          }
          if (nota.comProblema) {
            throw new Error(
              `NF-e ${idNota} está "${nota.descricao}" no Bling. Corrija os dados e reenvie pelo Bling; a automação pega a chave quando for autorizada.`
            );
          }
          return `NF-e ${nota.descricao.toLowerCase()}`;
        });
      }

      // 5) Melhor Envio: envio + etiqueta
      const aguardandoNfe = integracoes.bling() && config.bling.emitirNfe && !meta(pedido, M.nfeChave);
      if (
        integracoes.melhorEnvio() &&
        config.melhorEnvio.criarEnvios &&
        !meta(pedido, M.meEnvio) &&
        !codigoRastreioManual(pedido) &&
        melhorEnvio.servicoDoPedido(pedido)
      ) {
        if (aguardandoNfe) {
          rel.feito.push('melhor envio: aguardando autorização da NF-e');
        } else {
          await passo('melhor envio', async () => {
            const idEnvio = await melhorEnvio.criarEnvio(pedido, meta(pedido, M.nfeChave));
            await salvarNoPedido(pedido, { [M.meEnvio]: idEnvio });
            await adicionarNota(pedido, `Envio adicionado ao carrinho do Melhor Envio (ID ${idEnvio}).`);
            return idEnvio;
          });
        }
      }
      const idEnvio = meta(pedido, M.meEnvio);
      if (integracoes.melhorEnvio() && config.melhorEnvio.comprarEtiqueta && idEnvio && !meta(pedido, M.meEtiqueta)) {
        await passo('etiqueta', async () => {
          const url = await melhorEnvio.comprarEtiqueta(idEnvio);
          await salvarNoPedido(pedido, { [M.meEtiqueta]: url });
          await adicionarNota(pedido, `Etiqueta comprada. Imprimir: ${url}`);
          await alertarLoja(`Etiqueta pronta — pedido #${pedido.id}`, `<p><a href="${url}">Imprimir etiqueta do pedido #${pedido.id}</a></p>`);
          return url;
        });
      }

      // 6) Rastreio
      await passo('rastreio', () => verificarRastreio(pedido, opcoes.rastreioMelhorEnvio));
    }

    if (rel.erros.length) {
      const resumo = rel.erros.join(' | ').slice(0, 500);
      if (meta(pedido, M.erro) !== resumo) {
        await salvarNoPedido(pedido, { [M.erro]: resumo }).catch(() => {});
        await adicionarNota(pedido, `⚠️ Automação: ${resumo}`).catch(() => {});
        await alertarLoja(`Erro na automação do pedido #${pedido.id}`, `<p>${rel.erros.map((e) => `• ${escapar(e)}`).join('<br>')}</p>`);
        await alertaErroPedido(pedido.id, rel.erros);
      }
    } else if (meta(pedido, M.erro)) {
      await salvarNoPedido(pedido, { [M.erro]: '' }).catch(() => {});
    }

    return rel;
  } catch (e) {
    rel.erros.push((e as Error).message);
    return rel;
  } finally {
    await liberarTrava(`pedido:${id}`);
  }
}

/**
 * Busca o rastreio (Melhor Envio ou informado à mão), avisa o cliente e conclui o pedido.
 * `codigoInformado` vem do webhook do Melhor Envio, que já traz o código e evita uma consulta.
 */
async function verificarRastreio(pedido: WcPedido, codigoInformado?: string): Promise<string | void> {
  if (meta(pedido, M.avisoEnviado)) return;

  let codigo = codigoRastreioManual(pedido) || codigoInformado;

  const idEnvio = meta(pedido, M.meEnvio);
  if (!codigo && idEnvio && integracoes.melhorEnvio()) {
    let r: Awaited<ReturnType<typeof melhorEnvio.rastreio>>;
    try {
      r = await melhorEnvio.rastreio(idEnvio);
    } catch (e) {
      // Envio que não existe na conta do token atual (ex.: token trocado para outra conta do
      // Melhor Envio): esquece o ID para a próxima rodada criar o envio de novo, na conta certa.
      if (/Melhor Envio (403|404) /.test((e as Error).message)) {
        await esquecerEnvio(pedido, idEnvio, 'não existe na conta atual do Melhor Envio');
        return 'envio antigo não encontrado: será criado de novo';
      }
      throw e;
    }
    if (r.status === 'canceled' || r.status === 'expired') {
      await esquecerEnvio(pedido, idEnvio, r.status === 'canceled' ? 'foi cancelado' : 'expirou');
      return `envio ${r.status}: será criado de novo`;
    }
    if (r.codigo) codigo = r.codigo;
  }
  // Etiqueta gerada pela logística do Bling: o código fica no pedido de venda (ou na NF-e) de lá
  const idBling = Number(meta(pedido, M.blingPedido));
  if (!codigo && idBling && integracoes.bling()) {
    codigo = (await bling.rastreioDoPedidoVenda(idBling)) || undefined;
  }
  if (!codigo) return;
  const link = melhorEnvio.linkRastreio(codigo);

  const canais = await avisarCliente('enviado', pedido, { rastreio: codigo, linkRastreio: link });
  const novoStatus = config.woo.concluirAoEnviar && pedido.status === 'processing' ? 'completed' : undefined;
  await salvarNoPedido(pedido, { [M.rastreio]: codigo, [M.avisoEnviado]: canais.join(',') || 'nenhum canal' }, novoStatus);
  // Sem WhatsApp nem e-mail próprio configurados, a nota vai "para o cliente": o WooCommerce
  // manda por e-mail. Assim o cliente nunca fica sem o código de rastreio.
  await adicionarNota(pedido, `Seu pedido foi enviado! Código de rastreio: ${codigo} — acompanhe em ${link}`, canais.length === 0);
  return codigo;
}

async function esquecerEnvio(pedido: WcPedido, idEnvio: string, motivo: string): Promise<void> {
  await salvarNoPedido(pedido, { [M.meEnvio]: '', [M.meEtiqueta]: '' });
  await adicionarNota(pedido, `Envio ${idEnvio} ${motivo}. A automação vai criar um envio novo no carrinho do Melhor Envio.`);
}

/** Lembrete para Pix gerado e não pago. */
async function lembrarPix(pedido: WcPedido): Promise<Relatorio> {
  const rel: Relatorio = { pedido: pedido.id, status: pedido.status, feito: [], erros: [] };
  try {
    const canais = await avisarCliente('pixLembrete', pedido, { linkPagamento: linkPagamento(pedido) });
    await salvarNoPedido(pedido, { [M.avisoPix]: canais.join(',') || 'nenhum canal' });
    rel.feito.push(`lembrete pix: ${canais.join(',') || 'nenhum canal'}`);
  } catch (e) {
    rel.erros.push(`lembrete pix: ${(e as Error).message}`);
  }
  return rel;
}

// ----------------- Rotinas do cron -----------------

/**
 * Reprocessa pedidos pagos recentes que ainda tenham alguma etapa pendente.
 * Primeiro os que faltam etapas "de verdade" (Bling, envio, avisos); depois, em ordem
 * aleatória, os que só esperam o código de rastreio. Para antes de estourar o tempo.
 */
export async function rotinaPedidos(prazo: number): Promise<Relatorio[]> {
  const desde = new Date(Date.now() - IDADE_MAXIMA_DIAS * 86_400_000);
  const pedidos = await listarPedidos('processing', desde, 300);

  const urgentes: WcPedido[] = [];
  const soRastreio: WcPedido[] = [];
  for (const p of pedidos) {
    const faltaEtapa =
      !meta(p, M.avisoPago) ||
      !meta(p, M.alertaLoja) ||
      (integracoes.meta() && !meta(p, M.metaCompra)) ||
      (integracoes.bling() && config.bling.enviarPedidos && !meta(p, M.blingPedido)) ||
      (integracoes.bling() && config.bling.emitirNfe && !!meta(p, M.blingPedido) && !meta(p, M.nfeChave)) ||
      (integracoes.melhorEnvio() && config.melhorEnvio.criarEnvios && !meta(p, M.meEnvio) && melhorEnvio.servicoDoPedido(p)) ||
      (config.melhorEnvio.comprarEtiqueta && meta(p, M.meEnvio) && !meta(p, M.meEtiqueta));
    if (faltaEtapa) urgentes.push(p);
    else if (!meta(p, M.avisoEnviado) && (meta(p, M.meEnvio) || meta(p, M.blingPedido) || codigoRastreioManual(p))) soRastreio.push(p);
  }
  soRastreio.sort(() => Math.random() - 0.5);
  // Mais novos primeiro: num pico de vendas, pedidos travados antigos não podem tomar o lugar dos novos.
  urgentes.reverse();

  const relatorios: Relatorio[] = [];
  for (const p of [...urgentes, ...soRastreio]) {
    if (Date.now() > prazo) break;
    relatorios.push(await processarPedido(p.id));
  }
  return relatorios;
}

export async function rotinaPix(prazo: number): Promise<Relatorio[]> {
  const agora = Date.now();
  const { lembreteAposHoras, lembreteAteHoras } = config.pix;
  const pedidos = await listarPedidos('pending', new Date(agora - lembreteAteHoras * 3_600_000), 200);
  const relatorios: Relatorio[] = [];
  for (const p of pedidos) {
    const idadeHoras = (agora - new Date(p.date_created_gmt + 'Z').getTime()) / 3_600_000;
    if (idadeHoras < lembreteAposHoras || meta(p, M.avisoPix)) continue;
    if (!p.payment_method.includes('pix')) continue;
    if (Date.now() > prazo) break;
    relatorios.push(await lembrarPix(p));
  }
  return relatorios;
}
