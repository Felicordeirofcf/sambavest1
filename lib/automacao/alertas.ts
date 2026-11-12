// Alertas para o celular do dono: venda paga, pagamento recusado, erro em pedido,
// Pix parado, tamanho acabando e resumo do dia.
//
// Canais (usa todos os que estiverem ligados):
//   • Telegram: TELEGRAM_BOT_TOKEN + chat conectado pelo painel (/painel/alertas)
//   • WhatsApp pessoal: ALERTA_WHATSAPP_NUMERO, enviado pela Evolution (só 1 mensagem para você,
//     nunca para clientes)
// O e-mail da loja (EMAIL_ADMIN) continua recebendo os alertas de sempre (notificacoes.alertarLoja).
import { config, integracoes } from './config';
import { enviarTextoEvolution } from './evolution';
import { adquirirTrava, kvGet, kvSet } from './kv';
import { registrarExecucao } from './monitor';
import { listarPedidos, WcPedido } from './woocommerce';

const CHAVE_CHAT = 'alertas:telegram:chat';
const CHAVE_PREFS = 'alertas:preferencias';

export const TIPOS_ALERTA = {
  venda: { nome: 'Venda paga', padrao: false },
  recusado: { nome: 'Pagamento recusado', padrao: true },
  erro: { nome: 'Erro em pedido (Bling, etiqueta)', padrao: true },
  pix: { nome: 'Pix parado sem pagamento', padrao: true },
  estoque: { nome: 'Tamanho acabando', padrao: true },
  resumo: { nome: 'Resumo do dia', padrao: true },
  anuncio: { nome: 'Anúncio reprovado ou conta parada', padrao: true },
} as const;
export type TipoAlerta = keyof typeof TIPOS_ALERTA;

/** Quais alertas estão ligados (o aviso de venda começa pausado). */
export async function preferenciasAlertas(): Promise<Record<TipoAlerta, boolean>> {
  const salvas = (await kvGet<Partial<Record<TipoAlerta, boolean>>>(CHAVE_PREFS).catch(() => null)) || {};
  const r = {} as Record<TipoAlerta, boolean>;
  for (const t of Object.keys(TIPOS_ALERTA) as TipoAlerta[]) r[t] = salvas[t] ?? TIPOS_ALERTA[t].padrao;
  return r;
}

export async function salvarPreferenciasAlertas(p: Record<TipoAlerta, boolean>): Promise<void> {
  await kvSet(CHAVE_PREFS, p);
}

async function ligado(tipo: TipoAlerta): Promise<boolean> {
  if (!alertasLigados()) return false;
  return (await preferenciasAlertas())[tipo];
}
const CHAVE_CODIGO = 'alertas:telegram:codigo';

const brl = (v: number | string) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fuso = 'America/Sao_Paulo';
export const diaLocal = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: fuso });
const horaLocal = (ms = Date.now()) => Number(new Date(ms).toLocaleString('en-US', { timeZone: fuso, hour: 'numeric', hour12: false })) % 24;
const linkPainel = (caminho: string) => `${config.siteUrl.replace(/\/$/, '')}${caminho}`;

// ---------------- Telegram ----------------

async function telegram<T = unknown>(metodo: string, corpo?: unknown): Promise<T> {
  const token = config.alertas.telegramToken;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado');
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: corpo ? 'POST' : 'GET',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
  });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !j?.ok) throw new Error(`Telegram ${res.status}: ${j?.description || 'falhou'}`);
  return j.result as T;
}

export async function chatTelegram(): Promise<string | undefined> {
  if (config.alertas.telegramChatId) return config.alertas.telegramChatId;
  return (await kvGet<string>(CHAVE_CHAT).catch(() => null)) || undefined;
}

/** Gera o link que conecta o seu Telegram: abrir e tocar em "Começar". */
export async function linkConexaoTelegram(): Promise<{ link: string; codigo: string }> {
  const eu = await telegram<{ username: string }>('getMe');
  const codigo = `sv${Math.random().toString(36).slice(2, 10)}`;
  await kvSet(CHAVE_CODIGO, codigo, 30 * 60);
  return { link: `https://t.me/${eu.username}?start=${codigo}`, codigo };
}

/** Procura a mensagem "/start <código>" enviada ao robô e guarda esse chat como o seu. */
export async function confirmarConexaoTelegram(): Promise<string> {
  const codigo = await kvGet<string>(CHAVE_CODIGO);
  if (!codigo) throw new Error('O código expirou. Gere o link de novo.');
  const atualizacoes = await telegram<{ message?: { text?: string; chat?: { id: number; type: string; first_name?: string } } }[]>(
    'getUpdates',
    { limit: 100, allowed_updates: ['message'] }
  );
  const achou = [...atualizacoes].reverse().find((u) => u.message?.text?.includes(codigo) && u.message.chat?.type === 'private');
  if (!achou?.message?.chat) throw new Error('Ainda não recebi sua mensagem. Abra o link no celular e toque em "Começar".');
  const chat = String(achou.message.chat.id);
  await kvSet(CHAVE_CHAT, chat);
  await kvSet(CHAVE_CODIGO, '', 1);
  await telegram('sendMessage', { chat_id: chat, text: '✅ Pronto! A partir de agora os alertas da Samba Vest chegam aqui.' });
  return achou.message.chat.first_name || chat;
}

// ---------------- Envio ----------------

/**
 * Manda o alerta para os canais ligados. Nunca lança erro.
 * `chave`: não repete o mesmo alerta (ex.: "venda:1187") durante `ttlS` segundos.
 */
export async function alertarCelular(texto: string, opcoes: { chave?: string; ttlS?: number } = {}): Promise<string[]> {
  try {
    if (opcoes.chave && !(await adquirirTrava(`alerta:${opcoes.chave}`, opcoes.ttlS ?? 3 * 86_400))) return [];
  } catch {
    // sem KV: segue (no máximo repete)
  }
  const canais: string[] = [];
  const erros: string[] = [];
  if (integracoes.telegram()) {
    try {
      const chat = await chatTelegram();
      if (chat) {
        await telegram('sendMessage', { chat_id: chat, text: texto.slice(0, 4000), disable_web_page_preview: true });
        canais.push('telegram');
      }
    } catch (e) {
      erros.push((e as Error).message);
    }
  }
  if (integracoes.evolution() && config.alertas.whatsappNumero) {
    try {
      await enviarTextoEvolution(config.alertas.whatsappNumero, texto);
      canais.push('whatsapp');
    } catch (e) {
      erros.push((e as Error).message);
    }
  }
  if (canais.length || erros.length) await registrarExecucao('alerta', erros.length === 0, erros.join(' | ') || canais.join(','));
  if (erros.length) console.error('[alertas] falha ao enviar', erros.join(' | '));
  return canais;
}

export function alertasLigados(): boolean {
  return integracoes.telegram() || (integracoes.evolution() && Boolean(config.alertas.whatsappNumero));
}

// ---------------- Textos ----------------

function nomeCliente(p: WcPedido): string {
  return `${p.billing?.first_name || ''} ${(p.billing?.last_name || '').slice(0, 1)}${p.billing?.last_name ? '.' : ''}`.trim() || 'Cliente';
}

function metodoCurto(p: WcPedido): string {
  return p.payment_method.includes('pix') ? 'Pix' : p.payment_method.includes('credit') || p.payment_method.includes('card') ? 'Cartão' : p.payment_method_title || '';
}

/** Vendas pagas de hoje (inclui o pedido atual se o cache ainda não tiver ele). */
async function totaisDeHoje(incluir?: WcPedido): Promise<{ qtd: number; valor: number }> {
  const { pedidosRecentes } = await import('../painel/dados');
  const hoje = diaLocal();
  const pagos = (await pedidosRecentes(2)).filter((p) => ['processing', 'completed'].includes(p.status) && diaLocal(p.pago || p.criado) === hoje);
  let qtd = pagos.length;
  let valor = pagos.reduce((s, p) => s + p.total, 0);
  if (incluir && !pagos.some((p) => p.id === incluir.id)) {
    qtd += 1;
    valor += Number(incluir.total) || 0;
  }
  return { qtd, valor };
}

export async function alertaVenda(p: WcPedido): Promise<void> {
  if (!(await ligado('venda'))) return;
  const itens = p.line_items.map((i) => `• ${i.quantity}x ${i.name}`).join('\n');
  let hoje = '';
  try {
    const t = await totaisDeHoje(p);
    hoje = `\nHoje: ${t.qtd} ${t.qtd === 1 ? 'venda' : 'vendas'} · ${brl(t.valor)}`;
  } catch {
    // sem o total do dia
  }
  const local = [p.shipping?.city || p.billing?.city, p.shipping?.state || p.billing?.state].filter(Boolean).join('/');
  await alertarCelular(
    `💰 Venda paga! #${p.id} · ${brl(p.total)} (${metodoCurto(p)})\n${itens}\n${nomeCliente(p)}${local ? ` · ${local}` : ''}${hoje}\n${linkPainel(`/painel/pedidos/${p.id}`)}`,
    { chave: `venda:${p.id}` }
  );
}

export async function alertaPagamentoRecusado(p: WcPedido): Promise<void> {
  if (!(await ligado('recusado'))) return;
  await alertarCelular(
    `❌ Pagamento recusado · pedido #${p.id} · ${brl(p.total)} (${metodoCurto(p)})\n${nomeCliente(p)}${telefoneLink(p, `Oi! Vi que o pagamento do seu pedido #${p.id} na Samba Vest não passou. Posso te ajudar a concluir?`)}\n${linkPainel(`/painel/pedidos/${p.id}`)}`,
    { chave: `recusado:${p.id}` }
  );
}

export async function alertaErroPedido(id: number, erros: string[]): Promise<void> {
  if (!(await ligado('erro'))) return;
  const resumo = erros.join(' | ').slice(0, 500);
  // Mesmo erro no mesmo pedido avisa uma vez por dia
  await alertarCelular(`⚠️ Erro no pedido #${id}\n${erros.map((e) => `• ${e}`).join('\n').slice(0, 1500)}\n${linkPainel(`/painel/pedidos/${id}`)}`, {
    chave: `erro:${id}:${resumo.length}:${resumo.slice(0, 40)}`,
    ttlS: 86_400,
  });
}

function telefoneLink(p: WcPedido, mensagem: string): string {
  const tel = (p.billing?.phone || '').replace(/\D/g, '');
  if (tel.length < 10) return '';
  const numero = tel.startsWith('55') && tel.length >= 12 ? tel : `55${tel}`;
  return `\nChamar no WhatsApp: https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

// ---------------- Rotina (cron a cada 15 min) ----------------

export type ResultadoAlertas = { pix: number; estoque: number; resumo: boolean; anuncios: number };

export async function rotinaAlertas(prazo: number): Promise<ResultadoAlertas> {
  const r: ResultadoAlertas = { pix: 0, estoque: 0, resumo: false, anuncios: 0 };
  if (!alertasLigados()) return r;
  const prefs = await preferenciasAlertas();

  // 1) Pix gerado e não pago há mais de X minutos (até 6 h: depois disso o lembrete ao cliente cuida)
  const agora = Date.now();
  const min = config.alertas.pixMinutos;
  const pendentes = prefs.pix ? await listarPedidos('pending', new Date(agora - 6 * 3_600_000), 100) : [];
  for (const p of pendentes) {
    if (Date.now() > prazo) break;
    if (!p.payment_method.includes('pix')) continue;
    const idadeMin = (agora - new Date(p.date_created_gmt + 'Z').getTime()) / 60_000;
    if (idadeMin < min) continue;
    const enviados = await alertarCelular(
      `⏳ Pix parado há ${Math.round(idadeMin)} min · pedido #${p.id} · ${brl(p.total)}\n${p.line_items.map((i) => `• ${i.quantity}x ${i.name}`).join('\n')}\n${nomeCliente(p)}${telefoneLink(p, `Oi ${p.billing?.first_name || ''}! Vi que o Pix do seu pedido #${p.id} na Samba Vest ainda está em aberto. Posso te ajudar a finalizar?`)}`,
      { chave: `pix:${p.id}` }
    );
    if (enviados.length) r.pix++;
  }

  // 2) Tamanho acabando (produtos da Black Friday durante a campanha; fora dela, todos)
  if (prefs.estoque && Date.now() < prazo) {
    try {
      const { estoque } = await import('../painel/dados');
      const { produtosBF, faseBF } = await import('../blackfriday');
      const idsBF = faseBF() === 'durante' ? new Set((await produtosBF()).map((p) => p.wooId).filter(Boolean)) : null;
      const linhas = (await estoque()).filter(
        (l) => l.gerencia && typeof l.quantidade === 'number' && l.quantidade < config.alertas.estoqueMinimo && (!idsBF || idsBF.has(l.produtoId))
      );
      for (const l of linhas) {
        const q = l.quantidade as number;
        // Avisa de novo quando o número muda (2 → 1 → 0)
        const enviados = await alertarCelular(
          q <= 0 ? `🚫 Esgotou: ${l.produto} · ${l.variacao}` : `📦 Estoque acabando: ${l.produto} · ${l.variacao} · restam ${q}`,
          { chave: `estoque:${l.variacaoId || l.produtoId}:${q}`, ttlS: 7 * 86_400 }
        );
        if (enviados.length) r.estoque++;
      }
    } catch (e) {
      console.error('[alertas] estoque', (e as Error).message);
    }
  }

  // 3) Anúncios: reprovado, com problema ou conta parada (ex.: saldo acabou)
  if (prefs.anuncio && integracoes.metaAds() && Date.now() < prazo) {
    try {
      const { anuncios, contaAnuncios, STATUS_CONTA } = await import('./metaAds');
      const hoje = diaLocal();
      const [conta, lista] = await Promise.all([contaAnuncios(), anuncios({ desde: hoje, ate: hoje })]);
      if (conta.status !== 1) {
        const enviados = await alertarCelular(
          `📣 Conta de anúncios parada: ${STATUS_CONTA[conta.status] || `situação ${conta.status}`}${conta.saldo ? ` · ${conta.saldo}` : ''}\nOs anúncios não estão rodando. Confira o saldo/pagamento no Gerenciador de Anúncios.\n${linkPainel('/painel/anuncios')}`,
          { chave: `conta-anuncios:${conta.status}:${hoje}`, ttlS: 2 * 86_400 }
        );
        if (enviados.length) r.anuncios++;
      }
      for (const a of lista.filter((x) => x.status === 'DISAPPROVED' || x.status === 'WITH_ISSUES')) {
        const enviados = await alertarCelular(
          `📣 Anúncio ${a.status === 'DISAPPROVED' ? 'REPROVADO' : 'com problema'}: ${a.nome}${a.motivoReprovacao ? `\nMotivo: ${a.motivoReprovacao.slice(0, 400)}` : ''}\n${linkPainel('/painel/anuncios')}`,
          { chave: `anuncio:${a.id}:${a.status}`, ttlS: 7 * 86_400 }
        );
        if (enviados.length) r.anuncios++;
      }
    } catch (e) {
      console.error('[alertas] anúncios', (e as Error).message);
    }
  }

  // 4) Resumo do dia (a partir da hora configurada, uma vez por dia)
  if (prefs.resumo && Date.now() < prazo && horaLocal() >= config.alertas.horaResumo) {
    const hoje = diaLocal();
    try {
      const texto = await textoResumoDoDia();
      const enviados = await alertarCelular(texto, { chave: `resumo:${hoje}`, ttlS: 2 * 86_400 });
      r.resumo = enviados.length > 0;
    } catch (e) {
      console.error('[alertas] resumo', (e as Error).message);
    }
  }
  return r;
}

export async function textoResumoDoDia(): Promise<string> {
  const { pedidosRecentes } = await import('../painel/dados');
  const { nomeBase } = await import('../painel/metricas');
  const { PERIODO_BF, faseBF, diasAteFimBF } = await import('../blackfridayPeriodo');
  const lista = await pedidosRecentes(30);
  const hoje = diaLocal();
  const pagosHoje = lista.filter((p) => ['processing', 'completed'].includes(p.status) && diaLocal(p.pago || p.criado) === hoje);
  const valor = pagosHoje.reduce((s, p) => s + p.total, 0);
  const pecas = new Map<string, number>();
  for (const p of pagosHoje) for (const i of p.itens) pecas.set(nomeBase(i.nome), (pecas.get(nomeBase(i.nome)) || 0) + i.qtd);
  const top = [...pecas].sort((a, b) => b[1] - a[1])[0];
  const pixAbertos = lista.filter((p) => p.status === 'pending' && p.metodo.includes('pix') && diaLocal(p.criado) === hoje).length;
  let black = '';
  if (faseBF() === 'durante') {
    const desde = PERIODO_BF.inicio.getTime();
    const pagosBF = lista.filter((p) => ['processing', 'completed'].includes(p.status) && (p.pago || p.criado) >= desde);
    const pecasBF = pagosBF.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.qtd, 0), 0);
    const dias = diasAteFimBF();
    black = `\n🖤 Black: ${pecasBF} peças · ${brl(pagosBF.reduce((s, p) => s + p.total, 0))} · ${dias === 0 ? 'hoje é o último dia!' : `faltam ${dias} dia(s)`}`;
  }
  const [, mes, dia] = hoje.split('-');
  return (
    `📊 Resumo de hoje (${dia}/${mes})\n` +
    `Vendas: ${pagosHoje.length} · ${brl(valor)}\n` +
    `Ticket médio: ${brl(pagosHoje.length ? valor / pagosHoje.length : 0)}\n` +
    (top ? `Mais vendida: ${top[0]} (${top[1]})\n` : '') +
    `Pix em aberto hoje: ${pixAbertos}` +
    black +
    `\n${linkPainel('/painel')}`
  );
}
