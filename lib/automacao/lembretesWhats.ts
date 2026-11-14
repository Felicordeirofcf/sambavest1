// Lembretes automáticos pelo WhatsApp (Evolution): Pix não pago, cartão recusado e carrinho
// abandonado. Liga com WHATSAPP_LEMBRETES=true (desligado por padrão).
//
// Travas contra bloqueio do número (a Evolution não é a API oficial):
//  - só para quem DIGITOU o telefone no checkout e só se o número tem WhatsApp;
//  - uma mensagem por pedido/carrinho e no máximo uma por telefone a cada 24 h;
//  - no máximo WHATSAPP_LEMBRETES_DIA por dia (padrão 20) e 2 por rodada do cron (a cada 30 min),
//    com uma pausa entre um envio e outro;
//  - quem responde SAIR não recebe mais (a IA continua atendendo normalmente);
//  - não manda para quem já está conversando com a loja (conversa com uma pessoa ou recente).
// Funciona 24 h (a loja vende de madrugada). Se o cliente responder, a IA continua a conversa.
import { semJanela24h, enviarAoCliente } from './atendimento';
import { listarAbandonos } from './abandono';
import { config } from './config';
import { obterConversa, registrarSaida } from './conversas';
import { temWhatsapp } from './evolution';
import { adquirirTrava, kvGet, kvIncr, kvSet } from './kv';
import { chaveTelefone, telefoneWhatsapp } from './whatsapp';
import { linkPagamento, listarPedidos, type WcPedido } from './woocommerce';

const DIA_MS = 86_400_000;
const POR_RODADA = 2;
const site = () => config.siteUrl.replace(/\/$/, '');
const diaLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const RODAPE = '\n\nSe não quiser receber lembretes, é só responder SAIR.';

export const lembretesLigados = () =>
  ['1', 'true', 'sim', 'yes'].includes((process.env.WHATSAPP_LEMBRETES || '').trim().toLowerCase()) && semJanela24h();
const limiteDia = () => Math.max(0, Number(process.env.WHATSAPP_LEMBRETES_DIA) || 20);

// ---------- Saída da lista ----------

const chaveSair = (tel: string) => `lembretes:sair:${chaveTelefone(tel) || tel}`;
export const PALAVRAS_SAIR = ['sair', 'parar', 'pare', 'stop', 'cancelar lembretes', 'nao quero receber'];

export async function sairDosLembretes(tel: string): Promise<void> {
  await kvSet(chaveSair(tel), Date.now(), 365 * 86_400);
}
const saiu = async (tel: string) => Boolean(await kvGet<number>(chaveSair(tel)).catch(() => null));

// ---------- Candidatos ----------

type Candidato = { tipo: 'pix' | 'cartao' | 'carrinho'; chave: string; telefone: string; texto: string; criadoEm: number };

const primeiroNome = (n?: string) => (n || '').trim().split(/\s+/)[0] || '';
const itensTexto = (p: WcPedido) => p.line_items.slice(0, 3).map((i) => `${i.quantity}x ${i.name}`).join(', ');
const idade = (p: WcPedido) => Date.now() - new Date(p.date_created_gmt + 'Z').getTime();

async function candidatos(): Promise<Candidato[]> {
  const lista: Candidato[] = [];
  const desde = new Date(Date.now() - DIA_MS);

  // Pix gerado e não pago (30 min a 24 h)
  for (const p of await listarPedidos('pending', desde, 100).catch(() => [])) {
    if (!p.payment_method.includes('pix') || idade(p) < 30 * 60_000) continue;
    const nome = primeiroNome(p.billing.first_name);
    lista.push({
      tipo: 'pix',
      chave: `pedido:${p.id}`,
      telefone: p.billing.phone || '',
      criadoEm: idade(p),
      texto: `Oi${nome ? ` ${nome}` : ''}! Aqui é da Samba Vest 💛 Vi que o Pix do seu pedido #${p.id} (${itensTexto(p)}) ainda não foi pago. Se ainda quiser, é só concluir por aqui: ${linkPagamento(p)}\n\nQualquer dúvida, me chama!${RODAPE}`,
    });
  }

  // Cartão recusado (10 min a 24 h)
  for (const p of await listarPedidos('failed', desde, 100).catch(() => [])) {
    if (p.payment_method.includes('pix') || idade(p) < 10 * 60_000) continue;
    const nome = primeiroNome(p.billing.first_name);
    lista.push({
      tipo: 'cartao',
      chave: `pedido:${p.id}`,
      telefone: p.billing.phone || '',
      criadoEm: idade(p),
      texto: `Oi${nome ? ` ${nome}` : ''}! Aqui é da Samba Vest 💛 O pagamento no cartão do seu pedido (${itensTexto(p)}) não foi aprovado pelo banco. Isso acontece às vezes! Quer tentar de novo ou pagar no Pix (aprovação na hora)? Posso te mandar o link certinho.${RODAPE}`,
    });
  }

  // Carrinho abandonado com telefone (1 h a 24 h)
  for (const a of await listarAbandonos(24).catch(() => [])) {
    if (!a.telefone || a.convertido || a.sair) continue;
    const espera = Date.now() - a.atualizadoEm;
    if (espera < 60 * 60_000) continue;
    const nome = primeiroNome(a.nome);
    const itens = a.itens.slice(0, 3).map((i) => `${i.qtd}x ${i.nome}`).join(', ');
    lista.push({
      tipo: 'carrinho',
      chave: `carrinho:${a.id}`,
      telefone: a.telefone,
      criadoEm: espera,
      texto: `Oi${nome ? ` ${nome}` : ''}! Aqui é da Samba Vest 💛 Sua sacola ficou guardada: ${itens}. Pra finalizar é só abrir: ${site()}/checkout?recuperar=${encodeURIComponent(a.id)}&utm_source=whatsapp&utm_medium=lembrete&utm_campaign=carrinho\n\nFicou alguma dúvida de tamanho ou frete? Me pergunta aqui!${RODAPE}`,
    });
  }
  // Os mais recentes primeiro (mais chance de converter)
  return lista.sort((a, b) => a.criadoEm - b.criadoEm);
}

// ---------- Rotina ----------

export type ResultadoLembretes = { ligado: boolean; enviados: string[]; pulados: Record<string, number>; erro?: string };

export async function rotinaLembretesWhats(prazo: number): Promise<ResultadoLembretes> {
  const r: ResultadoLembretes = { ligado: lembretesLigados(), enviados: [], pulados: {} };
  if (!r.ligado) return r;
  const pular = (motivo: string) => (r.pulados[motivo] = (r.pulados[motivo] || 0) + 1);
  const chaveDia = `lembretes:dia:${diaLocal()}`;

  for (const c of await candidatos()) {
    if (r.enviados.length >= POR_RODADA || Date.now() > prazo - 8_000) break;
    const tel = telefoneWhatsapp(c.telefone || '');
    if (!tel) {
      pular('sem telefone válido');
      continue;
    }
    // Limite do dia antes de "gastar" o lembrete deste pedido/carrinho
    if (((await kvGet<number>(chaveDia)) || 0) >= limiteDia()) {
      pular('limite do dia');
      break;
    }
    // Uma vez por pedido/carrinho (marca já, para não repetir nem se der erro)
    if (!(await adquirirTrava(`lembretes:feito:${c.chave}`, 30 * 86_400))) continue;
    if (await saiu(tel)) {
      pular('pediu para sair');
      continue;
    }
    const conversa = await obterConversa(tel).catch(() => null);
    const recente = conversa?.mensagens.some((m) => Date.now() - m.em < 6 * 3_600_000);
    if ((conversa?.humanoAte && conversa.humanoAte > Date.now()) || recente) {
      pular('já está conversando com a loja');
      continue;
    }
    // No máximo 1 lembrete por telefone a cada 24 h (o mesmo cliente pode ter pedido e carrinho)
    if (!(await adquirirTrava(`lembretes:tel:${chaveTelefone(tel) || tel}`, 86_400))) {
      pular('já recebeu lembrete hoje');
      continue;
    }
    const existe = await temWhatsapp(tel).catch(() => null);
    if (existe === false) {
      pular('número sem WhatsApp');
      continue;
    }
    try {
      // Pausa entre envios (parece digitação humana e espaça as mensagens)
      if (r.enviados.length) await new Promise((ok) => setTimeout(ok, 4_000 + Math.random() * 4_000));
      const id = await enviarAoCliente(tel, c.texto);
      await registrarSaida(tel, c.texto, 'robo', id);
      await kvIncr(chaveDia);
      r.enviados.push(c.tipo);
    } catch (e) {
      r.erro = (e as Error).message.slice(0, 200);
      pular('erro ao enviar');
    }
  }
  return r;
}
