// Atendimento pelo WhatsApp: o que fazer com cada mensagem que chega.
//
// 1. Guarda a mensagem na conversa (Upstash) para o painel /atendimento.
// 2. Avisa o dono (e-mail EMAIL_ADMIN e/ou WhatsApp WHATSAPP_NUMERO_DONO).
// 3. Se WHATSAPP_RESPOSTAS_AUTOMATICAS=true, responde sozinho as dúvidas simples
//    (status do pedido, tabela de tamanhos, prazo). O resto vai para uma pessoa.
//
// Os textos das respostas vêm das variáveis WHATSAPP_RESPOSTA_* (aprovadas pelo dono).
// Resposta sem texto configurado = a dúvida vai para o atendimento humano.
import { config } from './config';
import { alterarConversa, Conversa, janelaAberta, obterConversa, registrarSaida } from './conversas';
import { adquirirTrava, kvGet, kvSet } from './kv';
import { enviarEmail, escapar } from './notificacoes';
import { chaveTelefone, enviarTemplate, enviarTexto, telefoneWhatsapp } from './whatsapp';
import { meta, mesmoTelefone, obterPedido, pedidosDoTelefone, WcPedido } from './woocommerce';

// ---------- Mensagem recebida (formato do webhook da Meta) ----------

export type MensagemMeta = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  location?: { name?: string; address?: string; latitude?: number; longitude?: number };
};

const TIPOS_MIDIA: Record<string, string> = {
  image: 'imagem',
  audio: 'áudio',
  video: 'vídeo',
  document: 'documento',
  sticker: 'figurinha',
  location: 'localização',
  contacts: 'contato',
};

export function textoDaMensagem(m: MensagemMeta): { texto: string; ehTexto: boolean } {
  if (m.type === 'text') return { texto: m.text?.body || '', ehTexto: true };
  if (m.type === 'button') return { texto: m.button?.text || '', ehTexto: true };
  if (m.type === 'interactive') {
    return { texto: m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '', ehTexto: true };
  }
  const legenda = m.image?.caption || m.video?.caption || m.document?.caption || m.document?.filename || '';
  const local = m.location ? ` ${m.location.name || ''} ${m.location.address || ''}`.trimEnd() : '';
  return { texto: `[${TIPOS_MIDIA[m.type] || m.type}]${legenda ? ' ' + legenda : ''}${local}`, ehTexto: false };
}

// ---------- Entender a dúvida ----------

export type Intencao =
  | { tipo: 'pedido'; numero?: number }
  | { tipo: 'tamanhos' }
  | { tipo: 'prazo' }
  | { tipo: 'saudacao' }
  | { tipo: 'outro' };

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function classificar(textoOriginal: string): Intencao {
  const t = normalizar(textoOriginal).trim();

  const num = t.match(/(?:pedido|compra|n[ºo°.]?|numero|#)\s*:?\s*#?\s*(\d{3,8})\b/) || t.match(/^#?\s*(\d{3,8})$/);
  if (num) return { tipo: 'pedido', numero: Number(num[1]) };

  if (/\b(rastre|rastrei|codigo de rastreio|status|meu pedido|minha compra|minha camisa|ja foi enviad|foi enviad|foi postad|cade|onde esta|chegou|nao chegou)/.test(t)) {
    return { tipo: 'pedido' };
  }
  if (/\b(tamanho|tamanhos|medida|medidas|tabela|veste|vestir|forma pequeno|forma grande|numeracao|pp|gg|exg|xg)\b/.test(t)) {
    return { tipo: 'tamanhos' };
  }
  if (/\b(prazo|demora|quanto tempo|quantos dias|quando chega|chega em|dias uteis|entrega|entregam)\b/.test(t)) {
    return { tipo: 'prazo' };
  }
  if (/^((oi+|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|hello|hi)[\s!.,?]*)+$/.test(t)) {
    return { tipo: 'saudacao' };
  }
  return { tipo: 'outro' };
}

// ---------- Montar a resposta ----------

const STATUS: Record<string, string> = {
  pending: 'aguardando pagamento',
  'on-hold': 'aguardando a confirmação do pagamento',
  processing: 'pagamento aprovado, em separação',
  completed: 'enviado',
  cancelled: 'cancelado',
  refunded: 'reembolsado',
  failed: 'pagamento não aprovado',
};

function rastreioDoPedido(p: WcPedido): string | undefined {
  return meta(p, '_sv_rastreio') || meta(p, '_correios_tracking_code');
}

function preencher(modelo: string, valores: Record<string, string>): string {
  return modelo
    .replace(/\\n/g, '\n') // permite quebra de linha escrita como \n na variável de ambiente
    .replace(/\{(\w+)\}/g, (_, k: string) => valores[k] ?? '');
}

/** Texto do status de um pedido. Usa WHATSAPP_RESPOSTA_STATUS se o dono configurou. */
function textoStatus(p: WcPedido): string {
  const rastreio = rastreioDoPedido(p);
  const valores = {
    nome: (p.billing.first_name || '').split(' ')[0],
    pedido: String(p.id),
    status: STATUS[p.status] || p.status,
    rastreio: rastreio || '',
    link: rastreio ? `https://www.melhorrastreio.com.br/rastreio/${rastreio}` : '',
    site: config.siteUrl,
  };
  if (config.whatsapp.respostas.status) return preencher(config.whatsapp.respostas.status, valores);
  // Padrão: só os dados do pedido, sem texto de marketing.
  return [
    `Pedido #${valores.pedido}: ${valores.status}.`,
    rastreio ? `Rastreio: ${rastreio}\n${valores.link}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function respostaPedido(numeroCliente: string, numeroPedido?: number): Promise<{ texto: string; pedidos: number[] } | null> {
  let pedidos: WcPedido[] = [];
  if (numeroPedido) {
    try {
      const p = await obterPedido(numeroPedido);
      // Só informa o pedido para o telefone que fez a compra (privacidade).
      if (mesmoTelefone(p.billing?.phone || '', numeroCliente) || mesmoTelefone(p.shipping?.phone || '', numeroCliente)) {
        pedidos = [p];
      }
    } catch {
      // pedido não existe
    }
  } else {
    pedidos = (await pedidosDoTelefone(numeroCliente)).filter((p) => !['checkout-draft', 'trash'].includes(p.status));
  }
  if (!pedidos.length) return null; // não achou: passa para uma pessoa
  const recentes = pedidos.slice(0, 3);
  return { texto: recentes.map(textoStatus).join('\n\n'), pedidos: recentes.map((p) => p.id) };
}

export async function montarResposta(
  intencao: Intencao,
  numeroCliente: string
): Promise<{ texto: string; pedidos?: number[] } | null> {
  const r = config.whatsapp.respostas;
  const valores = { site: config.siteUrl, nome: '', pedido: '', status: '', rastreio: '', link: '' };
  switch (intencao.tipo) {
    case 'pedido':
      return respostaPedido(numeroCliente, intencao.numero);
    case 'tamanhos':
      return r.tamanhos ? { texto: preencher(r.tamanhos, valores) } : null;
    case 'prazo':
      return r.prazo ? { texto: preencher(r.prazo, valores) } : null;
    case 'saudacao':
      return r.boasVindas ? { texto: preencher(r.boasVindas, valores) } : null;
    default:
      return null;
  }
}

// ---------- Dono ----------

const CHAVE_JANELA_DONO = 'wa:dono:ultima';

export function ehDono(numero: string): boolean {
  const dono = config.whatsapp.numeroDono;
  return Boolean(dono && chaveTelefone(dono) === chaveTelefone(numero));
}

async function alertarDonoWhatsapp(c: Conversa, trecho: string, motivo: string): Promise<string | null> {
  const para = telefoneWhatsapp(config.whatsapp.numeroDono || '');
  if (!para) return null;
  const nome = c.nome ? `${c.nome} (+${c.numero})` : `+${c.numero}`;
  const ultimaDono = await kvGet<number>(CHAVE_JANELA_DONO);
  if (ultimaDono && Date.now() - ultimaDono < 24 * 3_600_000 - 60_000) {
    await enviarTexto(
      para,
      `📩 ${motivo}\nDe: ${nome}\n"${trecho}"\n\nResponder: https://wa.me/${c.numero}\nPainel: ${config.siteUrl}/atendimento`
    );
    return 'whatsapp';
  }
  if (config.whatsapp.templateAlertaDono) {
    await enviarTemplate(para, config.whatsapp.templateAlertaDono, [nome, trecho.slice(0, 200)]);
    return 'whatsapp (template)';
  }
  return null;
}

async function alertarDonoEmail(c: Conversa, trecho: string, motivo: string): Promise<string | null> {
  if (!config.email.admin) return null;
  const nome = escapar(c.nome ? `${c.nome} (+${c.numero})` : `+${c.numero}`);
  const ultimas = c.mensagens
    .slice(-8)
    .map((m) => `<p style="margin:4px 0"><b>${m.de === 'cliente' ? 'Cliente' : m.de === 'robo' ? 'Robô' : 'Loja'}:</b> ${escapar(m.texto)}</p>`)
    .join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px">
<p><b>${escapar(motivo)}</b> — ${nome}</p>${ultimas}
<p><a href="https://wa.me/${c.numero}">Abrir no WhatsApp</a> · <a href="${escapar(config.siteUrl)}/atendimento">Painel de atendimento</a></p></div>`;
  const ok = await enviarEmail(config.email.admin, `[${config.lojaNome}] WhatsApp: ${motivo} — ${c.nome || '+' + c.numero}`, html);
  return ok ? 'email' : null;
}

/** Avisa o dono. Sem `urgente`, no máximo um alerta por conversa a cada WHATSAPP_ALERTA_INTERVALO_MIN. */
async function alertarDono(c: Conversa, trecho: string, motivo: string, urgente: boolean): Promise<string[]> {
  const modo = config.whatsapp.alertas;
  if (modo === 'nenhum' || (modo === 'humano' && !urgente)) return [];
  if (!urgente && !(await adquirirTrava(`wa:alerta:${chaveTelefone(c.numero)}`, config.whatsapp.alertaIntervaloMin * 60))) {
    return [];
  }
  const canais: string[] = [];
  for (const fn of [alertarDonoWhatsapp, alertarDonoEmail]) {
    try {
      const canal = await fn(c, trecho, motivo);
      if (canal) canais.push(canal);
    } catch (e) {
      console.error('[atendimento] falha ao alertar o dono:', (e as Error).message);
    }
  }
  return canais;
}

// ---------- Fluxo principal ----------

export type ResultadoMensagem = {
  numero: string;
  ignorada?: string;
  intencao?: string;
  respondeu?: boolean;
  humano?: boolean;
  alertas?: string[];
  erro?: string;
};

export async function processarMensagem(m: MensagemMeta, nomeContato?: string): Promise<ResultadoMensagem> {
  const numero = m.from;
  const res: ResultadoMensagem = { numero };

  // A Meta pode entregar a mesma mensagem mais de uma vez.
  if (!(await adquirirTrava(`wa:msg:${m.id}`, 3 * 86_400))) return { ...res, ignorada: 'repetida' };
  if (m.type === 'reaction' || m.type === 'system' || m.type === 'ephemeral') return { ...res, ignorada: m.type };

  // Mensagem do próprio dono: só abre a janela de 24h para os alertas por WhatsApp.
  if (ehDono(numero)) {
    await kvSet(CHAVE_JANELA_DONO, Date.now(), 2 * 86_400);
    return { ...res, ignorada: 'mensagem do dono (janela de alertas aberta por 24h)' };
  }

  const { texto, ehTexto } = textoDaMensagem(m);
  const agora = Date.now();
  let conversa = await alterarConversa(numero, (c) => {
    c.numero = numero;
    if (nomeContato) c.nome = nomeContato;
    c.mensagens.push({ id: m.id, de: 'cliente', texto, em: Number(m.timestamp) * 1000 || agora });
    c.ultimaDoClienteEm = agora;
    c.naoLidas = (c.naoLidas || 0) + 1;
  });

  const trecho = texto.slice(0, 300);
  const r = config.whatsapp.respostas;
  const comHumano = Boolean(conversa.humanoAte && conversa.humanoAte > agora);

  if (!r.ativas || comHumano) {
    res.alertas = await alertarDono(conversa, trecho, comHumano ? 'Cliente respondeu' : 'Nova mensagem', false);
    return res;
  }

  // Respostas automáticas (estamos dentro da janela de 24h: o cliente acabou de escrever).
  const intencao: Intencao = ehTexto ? classificar(texto) : { tipo: 'outro' };
  res.intencao = intencao.tipo;
  let resposta: Awaited<ReturnType<typeof montarResposta>> = null;
  try {
    resposta = await montarResposta(intencao, numero);
  } catch (e) {
    res.erro = (e as Error).message;
  }

  if (resposta && janelaAberta(conversa)) {
    try {
      const id = await enviarTexto(numero, resposta.texto);
      conversa = await alterarConversa(numero, (c) => {
        c.mensagens.push({ id, de: 'robo', texto: resposta!.texto, em: Date.now() });
        if (resposta!.pedidos) c.pedidos = resposta!.pedidos;
      });
      res.respondeu = true;
      res.alertas = await alertarDono(conversa, trecho, 'Respondida automaticamente', false);
      return res;
    } catch (e) {
      res.erro = (e as Error).message;
    }
  }

  // Não reconhecida (ou falhou): passa para uma pessoa e o robô fica quieto nesta conversa.
  res.humano = true;
  conversa = await alterarConversa(numero, (c) => {
    c.humanoAte = Date.now() + r.silencioHoras * 3_600_000;
  });
  if (r.humano) {
    try {
      const id = await enviarTexto(numero, preencher(r.humano, { site: config.siteUrl }));
      conversa = await registrarSaida(numero, r.humano, 'robo', id);
    } catch (e) {
      res.erro = (e as Error).message;
    }
  }
  res.alertas = await alertarDono(conversa, trecho, 'Precisa de atendimento', true);
  return res;
}

// ---------- Coexistência: mensagens que você mandou pelo app WhatsApp Business ----------

export type EcoMeta = MensagemMeta & { to: string };

/**
 * Registra no histórico uma mensagem enviada pelo app WhatsApp Business (celular ou PC).
 * Como uma pessoa assumiu a conversa, o robô fica quieto nela por WHATSAPP_HUMANO_SILENCIO_HORAS.
 */
export async function registrarEco(m: EcoMeta): Promise<ResultadoMensagem> {
  const numero = m.to;
  const res: ResultadoMensagem = { numero };
  if (!numero) return { ...res, ignorada: 'eco sem destinatário' };
  if (!(await adquirirTrava(`wa:msg:${m.id}`, 3 * 86_400))) return { ...res, ignorada: 'repetida' };
  if (m.type === 'reaction') return { ...res, ignorada: 'reação' };

  const { texto } = textoDaMensagem(m);
  await alterarConversa(numero, (c) => {
    if (c.mensagens.some((x) => x.id === m.id)) return; // já registrada (enviada pelo site)
    c.mensagens.push({ id: m.id, de: 'loja', texto: `${texto} (pelo app)`, em: Number(m.timestamp) * 1000 || Date.now() });
    c.naoLidas = 0;
    c.humanoAte = Date.now() + config.whatsapp.respostas.silencioHoras * 3_600_000;
  });
  return { ...res, humano: true };
}

/** Resposta digitada no painel por uma pessoa da loja. */
export async function responderPeloPainel(numero: string, texto: string): Promise<void> {
  const c = await obterConversa(numero);
  if (!c) throw new Error('Conversa não encontrada.');
  if (!janelaAberta(c)) {
    throw new Error('Passaram 24h desde a última mensagem do cliente. Pelo WhatsApp oficial, só é possível mandar um template.');
  }
  const id = await enviarTexto(c.numero, texto);
  await alterarConversa(numero, (cv) => {
    cv.mensagens.push({ id, de: 'loja', texto, em: Date.now() });
    cv.naoLidas = 0;
    // Enquanto a pessoa estiver conversando, o robô não interfere.
    cv.humanoAte = Date.now() + config.whatsapp.respostas.silencioHoras * 3_600_000;
  });
}
