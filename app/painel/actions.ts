'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { responderPeloPainel } from '../../lib/automacao/atendimento';
import { linkDeAutorizacao } from '../../lib/automacao/bling';
import { configurarWebhook, criarInstancia, desconectar } from '../../lib/automacao/evolution';
import { processarPedido } from '../../lib/automacao/pedidos';
import { adicionarNota, obterPedido, salvarNoPedido, wc } from '../../lib/automacao/woocommerce';
import { exigirLogin, sairDoPainel, tentarEntrar } from '../../lib/painel/auth';
import { limparCache } from '../../lib/painel/dados';
import { carregarFinanceiro } from '../../lib/painel/financeiro';
import { ETAPAS, obterContato, salvarContato } from '../../lib/painel/crm';
import { alterarConversa, obterConversa } from '../../lib/automacao/conversas';

const txt = (f: FormData, k: string) => String(f.get(k) || '').trim();

export async function entrar(formData: FormData) {
  const r = await tentarEntrar(txt(formData, 'senha'));
  if (r !== 'ok') redirect(`/painel/entrar?erro=${r}`);
  redirect('/painel');
}

export async function sair() {
  await sairDoPainel();
  redirect('/painel/entrar');
}

function voltarPedido(id: number, msg: string, tipo: 'ok' | 'erro' = 'ok'): never {
  redirect(`/painel/pedidos/${id}?${tipo}=${encodeURIComponent(msg)}`);
}

function idPedido(formData: FormData): number {
  const id = Number(txt(formData, 'id'));
  if (!Number.isInteger(id) || id <= 0) redirect('/painel/pedidos');
  return id;
}

/** Roda de novo as automações do pedido (Bling, NF-e, envio, avisos). */
export async function reprocessar(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  let msg = '';
  let tipo: 'ok' | 'erro' = 'ok';
  try {
    const rel = await processarPedido(id);
    if (rel.ignorado) msg = `Nada feito: ${rel.ignorado}.`;
    else if (rel.erros.length) {
      tipo = 'erro';
      msg = `Erros: ${rel.erros.join(' | ')}`;
    } else msg = rel.feito.length ? `Feito: ${rel.feito.join(', ')}.` : 'Tudo já estava em dia.';
  } catch (e) {
    tipo = 'erro';
    msg = (e as Error).message;
  }
  await limparCache();
  revalidatePath(`/painel/pedidos/${id}`);
  voltarPedido(id, msg, tipo);
}

/** Informa o código de rastreio à mão; a automação avisa o cliente e conclui o pedido. */
export async function informarRastreio(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  const codigo = txt(formData, 'codigo').toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9]{8,30}$/.test(codigo)) voltarPedido(id, 'Código de rastreio inválido.', 'erro');
  try {
    const pedido = await obterPedido(id);
    await salvarNoPedido(pedido, { _sv_rastreio: codigo });
    const rel = await processarPedido(id);
    await limparCache();
    voltarPedido(id, `Rastreio salvo. ${rel.feito.length ? `Feito: ${rel.feito.join(', ')}.` : ''}${rel.erros.length ? ` Erros: ${rel.erros.join(' | ')}` : ''}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;
    voltarPedido(id, (e as Error).message, 'erro');
  }
}

const STATUS_PERMITIDOS = ['processing', 'completed', 'cancelled', 'on-hold'];

export async function mudarStatus(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  const status = txt(formData, 'status');
  if (!STATUS_PERMITIDOS.includes(status)) voltarPedido(id, 'Status inválido.', 'erro');
  if (status === 'cancelled' && txt(formData, 'confirmar') !== 'sim') {
    voltarPedido(id, 'Marque a confirmação para cancelar o pedido.', 'erro');
  }
  try {
    await wc(`/orders/${id}`, { method: 'PUT', body: { status } });
    await limparCache();
  } catch (e) {
    voltarPedido(id, (e as Error).message, 'erro');
  }
  revalidatePath(`/painel/pedidos/${id}`);
  voltarPedido(id, 'Status atualizado.');
}

export async function anotar(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  const texto = txt(formData, 'nota');
  if (!texto) voltarPedido(id, 'Escreva a nota.', 'erro');
  const paraCliente = formData.get('cliente') === 'sim';
  try {
    const pedido = await obterPedido(id);
    await adicionarNota(pedido, texto.slice(0, 2000), paraCliente);
  } catch (e) {
    voltarPedido(id, (e as Error).message, 'erro');
  }
  voltarPedido(id, paraCliente ? 'Nota enviada ao cliente por e-mail.' : 'Nota interna salva.');
}

/** Responde o cliente no WhatsApp (só dentro da janela de 24h). */
export async function responderWhatsapp(formData: FormData) {
  await exigirLogin();
  const numero = txt(formData, 'numero').replace(/\D/g, '');
  const texto = txt(formData, 'texto');
  const voltar = txt(formData, 'voltar') || '/painel/clientes';
  const destino = voltar.startsWith('/painel/') ? voltar : '/painel/clientes';
  if (!numero || !texto) redirect(destino);
  let erro = '';
  try {
    await responderPeloPainel(numero, texto.slice(0, 4000));
  } catch (e) {
    erro = (e as Error).message;
  }
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${erro ? `erro=${encodeURIComponent(erro)}` : 'ok=Mensagem%20enviada'}`);
}

export async function atualizarDados() {
  await exigirLogin();
  await limparCache();
  revalidatePath('/painel');
  redirect('/painel');
}

export async function atualizarFinanceiro() {
  await exigirLogin();
  let erro = '';
  try {
    await carregarFinanceiro(true);
  } catch (e) {
    erro = (e as Error).message;
  }
  revalidatePath('/painel/financeiro');
  redirect(erro ? `/painel/financeiro?erro=${encodeURIComponent(erro)}` : '/painel/financeiro');
}

/** Abre a autorização do Bling com um "state" de uso único (o callback só aceita assim). */
export async function conectarBling() {
  await exigirLogin();
  redirect(await linkDeAutorizacao());
}

// ---------- CRM ----------

function chaveCrm(formData: FormData): string {
  const chave = txt(formData, 'chave').replace(/\D/g, '');
  if (!chave) redirect('/painel/crm');
  return chave;
}

export async function salvarCrm(formData: FormData) {
  await exigirLogin();
  const chave = chaveCrm(formData);
  const c = await obterContato(chave);
  if (!c) redirect('/painel/crm');
  const etapa = txt(formData, 'etapa');
  if (ETAPAS.some((e) => e.id === etapa)) c.etapa = etapa as typeof c.etapa;
  const nome = txt(formData, 'nome').slice(0, 80);
  c.nomeEditado = nome && nome !== c.nome ? nome : undefined;
  c.etiquetas = [...new Set(txt(formData, 'etiquetas').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  await salvarContato(c);
  redirect(`/painel/crm/${chave}?ok=${encodeURIComponent('Contato salvo.')}`);
}

export async function notaCrm(formData: FormData) {
  await exigirLogin();
  const chave = chaveCrm(formData);
  const texto = txt(formData, 'nota').slice(0, 2000);
  const c = await obterContato(chave);
  if (!c || !texto) redirect(`/painel/crm/${chave}`);
  c.notas = [{ texto, em: Date.now() }, ...c.notas].slice(0, 100);
  await salvarContato(c);
  redirect(`/painel/crm/${chave}?ok=${encodeURIComponent('Nota salva.')}`);
}

/** Marca a conversa como lida (zera as não lidas no atendimento e no CRM). */
export async function lidaCrm(formData: FormData) {
  await exigirLogin();
  const chave = chaveCrm(formData);
  const c = await obterContato(chave);
  if (c && (await obterConversa(c.numero))) {
    await alterarConversa(c.numero, (conv) => {
      conv.naoLidas = 0;
    });
  }
  redirect(`/painel/crm/${chave}`);
}

/** Move o contato de etapa (usado pelo quadro kanban, sem recarregar a página). */
export async function moverEtapaCrm(chave: string, etapa: string): Promise<{ ok: boolean }> {
  await exigirLogin();
  const k = String(chave || '').replace(/\D/g, '');
  if (!k || !ETAPAS.some((e) => e.id === etapa)) return { ok: false };
  const c = await obterContato(k);
  if (!c) return { ok: false };
  c.etapa = etapa as typeof c.etapa;
  await salvarContato(c);
  revalidatePath('/painel/crm');
  return { ok: true };
}

// ---------- WhatsApp pela Evolution (QR Code) ----------

function voltarWhats(msg: string, tipo: 'ok' | 'erro' = 'ok'): never {
  redirect(`/painel/whatsapp?${tipo}=${encodeURIComponent(msg)}`);
}

/** Cria a conexão (instância) e já aponta o recebimento de mensagens para o site. */
export async function criarConexaoWhatsapp() {
  await exigirLogin();
  let erro = '';
  try {
    await criarInstancia();
  } catch (e) {
    const msg = (e as Error).message;
    if (!/already|já existe|in use|403/i.test(msg)) erro = msg;
  }
  if (!erro) {
    try {
      await configurarWebhook();
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  if (erro) voltarWhats(erro, 'erro');
  voltarWhats('Conexão criada. Leia o QR Code com o WhatsApp do celular da loja.');
}

export async function configurarRecebimentoWhatsapp() {
  await exigirLogin();
  let url = '';
  try {
    url = await configurarWebhook();
  } catch (e) {
    voltarWhats((e as Error).message, 'erro');
  }
  voltarWhats(`Recebimento configurado: ${url}`);
}

export async function desconectarWhatsapp(formData: FormData) {
  await exigirLogin();
  if (txt(formData, 'confirmar') !== 'sim') voltarWhats('Marque a confirmação para desconectar.', 'erro');
  try {
    await desconectar();
  } catch (e) {
    voltarWhats((e as Error).message, 'erro');
  }
  voltarWhats('WhatsApp desconectado do painel. O celular continua funcionando normalmente.');
}

// ---------- Alertas no celular ----------

function voltarAlertas(msg: string, tipo: 'ok' | 'erro' = 'ok'): never {
  redirect(`/painel/alertas?${tipo}=${encodeURIComponent(msg)}`);
}

export async function gerarLinkTelegram() {
  await exigirLogin();
  const { linkConexaoTelegram } = await import('../../lib/automacao/alertas');
  let link = '';
  try {
    link = (await linkConexaoTelegram()).link;
  } catch (e) {
    voltarAlertas((e as Error).message, 'erro');
  }
  redirect(`/painel/alertas?link=${encodeURIComponent(link)}`);
}

export async function confirmarTelegram() {
  await exigirLogin();
  const { confirmarConexaoTelegram } = await import('../../lib/automacao/alertas');
  let nome = '';
  try {
    nome = await confirmarConexaoTelegram();
  } catch (e) {
    voltarAlertas((e as Error).message, 'erro');
  }
  voltarAlertas(`Telegram conectado (${nome}). Mandei uma mensagem de confirmação para você.`);
}

export async function salvarAlertas(formData: FormData) {
  await exigirLogin();
  const { TIPOS_ALERTA, salvarPreferenciasAlertas } = await import('../../lib/automacao/alertas');
  const prefs = {} as Record<keyof typeof TIPOS_ALERTA, boolean>;
  for (const t of Object.keys(TIPOS_ALERTA) as (keyof typeof TIPOS_ALERTA)[]) prefs[t] = formData.get(t) === 'on';
  await salvarPreferenciasAlertas(prefs);
  voltarAlertas('Preferências salvas.');
}

export async function testarAlerta() {
  await exigirLogin();
  const { alertarCelular, textoResumoDoDia } = await import('../../lib/automacao/alertas');
  let canais: string[] = [];
  try {
    canais = await alertarCelular(`🔔 Teste do painel Samba Vest

${await textoResumoDoDia()}`);
  } catch (e) {
    voltarAlertas((e as Error).message, 'erro');
  }
  if (!canais.length) voltarAlertas('Nenhum canal enviou. Conecte o Telegram (ou o WhatsApp pela Evolution) primeiro.', 'erro');
  voltarAlertas(`Alerta de teste enviado por: ${canais.join(' e ')}.`);
}

// ---------- Fotos da Black (foto vestida no topo da página) ----------

export async function escolherFotoVestida(formData: FormData) {
  await exigirLogin();
  const { OFERTAS, chaveFotoVestida, produtosBF } = await import('../../lib/blackfriday');
  const oferta = txt(formData, 'oferta');
  const url = txt(formData, 'url');
  if (!OFERTAS.some((o) => o.id === oferta)) redirect('/painel/fotos-black?erro=' + encodeURIComponent('Camisa inválida.'));
  const { kvDel, kvSet } = await import('../../lib/automacao/kv');
  if (!url) {
    await kvDel(chaveFotoVestida(oferta));
  } else {
    // Só aceita fotos que são mesmo deste produto no WooCommerce
    const p = (await produtosBF()).find((x) => x.id === oferta);
    if (!p?.galeria?.includes(url)) redirect('/painel/fotos-black?erro=' + encodeURIComponent('Essa foto não é deste produto.'));
    await kvSet(chaveFotoVestida(oferta), url);
  }
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/black-friday');
  redirect('/painel/fotos-black?ok=' + encodeURIComponent(url ? 'Foto escolhida! Os cards da Black já mostram essa foto.' : 'Voltou para a foto da camisa.'));
}

/** Marca um carrinho abandonado ou pedido não pago como "já chamei no WhatsApp". */
export async function marcarChamadoRecuperar(formData: FormData) {
  await exigirLogin();
  const k = txt(formData, 'k');
  if (/^(a|p):[\w-]{1,64}$/.test(k)) {
    const { marcarChamado } = await import('../../lib/painel/recuperar');
    await marcarChamado(k);
  }
  revalidatePath('/painel');
  redirect('/painel#recuperar');
}

// ---------- Atendimento (tela de conversas do WhatsApp) ----------

const voltarAtendimento = (numero: string, extra = ''): never =>
  redirect(`/painel/atendimento?n=${encodeURIComponent(numero)}${extra}`);

/** Ações de uma conversa: marcar lida, assumir (pausa a IA) ou devolver para a IA. */
export async function acaoAtendimento(formData: FormData) {
  await exigirLogin();
  const numero = txt(formData, 'numero').replace(/\D/g, '');
  const acao = txt(formData, 'acao');
  if (numero && (await obterConversa(numero))) {
    await alterarConversa(numero, (c) => {
      c.naoLidas = 0;
      if (acao === 'assumir') c.humanoAte = Date.now() + 12 * 3_600_000;
      if (acao === 'devolver') c.humanoAte = undefined;
    });
  }
  // Devolver para a IA: se o cliente está esperando, ela responde agora (e mostra o erro, se houver)
  let extra = '';
  if (acao === 'devolver' && numero) {
    try {
      const { responderPendenteComIA } = await import('../../lib/automacao/atendimento');
      extra = `&ok=${encodeURIComponent(await responderPendenteComIA(numero))}`;
    } catch (e) {
      extra = `&erro=${encodeURIComponent(`A IA não conseguiu responder: ${(e as Error).message}`.slice(0, 300))}`;
    }
  }
  revalidatePath('/painel/atendimento');
  voltarAtendimento(numero, extra);
}

/** Resposta digitada na tela de atendimento (sai pelo WhatsApp conectado). */
export async function responderAtendimento(formData: FormData) {
  await exigirLogin();
  const numero = txt(formData, 'numero').replace(/\D/g, '');
  const texto = txt(formData, 'texto').slice(0, 4000);
  if (!numero || !texto) voltarAtendimento(numero);
  let erro = '';
  try {
    await responderPeloPainel(numero, texto);
  } catch (e) {
    erro = (e as Error).message;
  }
  revalidatePath('/painel/atendimento');
  voltarAtendimento(numero, erro ? `&erro=${encodeURIComponent(erro)}` : '');
}

// ---------- Análise dos anúncios com IA ----------

/** Botão "Analisar agora" no painel de anúncios. */
export async function gerarAnaliseAnuncios() {
  await exigirLogin();
  let erro = '';
  try {
    const { analisarAnuncios } = await import('../../lib/automacao/agenteAnuncios');
    await analisarAnuncios();
  } catch (e) {
    erro = (e as Error).message;
  }
  revalidatePath('/painel/anuncios');
  redirect(`/painel/anuncios?${erro ? `erroIA=${encodeURIComponent(erro.slice(0, 200))}` : 'okIA=1'}#analise-ia`);
}

/** "Fiz" / "Ignorar" / "Desfazer" numa sugestão da IA. */
export async function decidirSugestaoAnuncio(formData: FormData) {
  await exigirLogin();
  const id = txt(formData, 'id').slice(0, 80);
  const acao = txt(formData, 'acao');
  if (id && (acao === 'fiz' || acao === 'ignorar' || acao === 'desfazer')) {
    const { decidirSugestao } = await import('../../lib/automacao/agenteAnuncios');
    await decidirSugestao(id, acao);
  }
  revalidatePath('/painel/anuncios');
  redirect('/painel/anuncios#analise-ia');
}
