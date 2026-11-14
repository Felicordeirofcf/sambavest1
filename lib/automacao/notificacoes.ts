// Avisos automáticos ao cliente (WhatsApp + e-mail via Resend) e alertas para a loja.
//
// WhatsApp pela API oficial: mensagens iniciadas pela empresa precisam de um TEMPLATE aprovado pela
// Meta (nomes e variáveis em AUTOMACAO.md). Sem a API oficial, com a Evolution conectada, os avisos de
// pagamento aprovado e de pedido enviado saem como mensagem normal (1 por compra, só para quem tem
// WhatsApp). O lembrete de Pix pela Evolution fica com lembretesWhats.ts, para não mandar em dobro.
import { config, integracoes } from './config';
import { registrarSaida } from './conversas';
import { temWhatsapp } from './evolution';
import { enviarTemplate, telefoneWhatsapp } from './whatsapp';
import { WcPedido } from './woocommerce';

export type Evento = 'recebido' | 'pago' | 'enviado' | 'pixLembrete';

export type DadosAviso = {
  rastreio?: string;
  linkRastreio?: string;
  linkPagamento?: string;
};

function brl(valor: string | number): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function primeiroNome(pedido: WcPedido): string {
  return (pedido.billing.first_name || 'cliente').split(' ')[0];
}

/** Variáveis do corpo de cada template, na ordem {{1}}, {{2}}, ... */
function parametrosTemplate(evento: Evento, pedido: WcPedido, dados: DadosAviso): string[] {
  const nome = primeiroNome(pedido);
  const numero = String(pedido.id);
  switch (evento) {
    case 'recebido':
      return [nome, numero, brl(pedido.total)];
    case 'pago':
      return [nome, numero];
    case 'enviado':
      return [nome, numero, dados.rastreio || '', dados.linkRastreio || ''];
    case 'pixLembrete':
      return [nome, numero, brl(pedido.total), dados.linkPagamento || ''];
  }
}

async function enviarWhatsapp(evento: Evento, pedido: WcPedido, dados: DadosAviso): Promise<boolean> {
  const template = config.whatsapp.templates[evento];
  const para = telefoneWhatsapp(pedido.billing.phone || '');
  if (!para) return false;
  if (!integracoes.whatsapp()) return enviarPelaEvolution(evento, pedido, dados);
  if (!template) return false;

  const parametros = parametrosTemplate(evento, pedido, dados);
  try {
    await enviarTemplate(para, template, parametros);
  } catch (e) {
    throw new Error(`WhatsApp (${template}): ${(e as Error).message}`);
  }
  // Mostra o aviso no histórico da conversa (painel de atendimento). Falha aqui não importa.
  await registrarSaida(para, `[aviso automático: ${template}] ${parametros.join(' · ')}`, 'aviso').catch(() => {});
  return true;
}

/** Texto do aviso pela Evolution (sem template). Só pagamento aprovado e pedido enviado. */
function textoEvolution(evento: Evento, pedido: WcPedido, dados: DadosAviso): string | null {
  const nome = primeiroNome(pedido);
  const ola = nome && nome !== 'cliente' ? `Oi, ${nome}!` : 'Oi!';
  const itens = pedido.line_items.slice(0, 3).map((i) => `${i.quantity}x ${i.name}`).join(', ');
  if (evento === 'pago') {
    return `${ola} Aqui é da Samba Vest 💛 Recebemos o pagamento do seu pedido #${pedido.id}${itens ? ` (${itens})` : ''}. Já estamos separando e te mando o código de rastreio aqui assim que for postado.\n\nQualquer dúvida, é só responder esta mensagem!`;
  }
  if (evento === 'enviado' && dados.rastreio) {
    return `${ola} Seu pedido #${pedido.id} da Samba Vest foi enviado 📦\n\nCódigo de rastreio: ${dados.rastreio}${dados.linkRastreio ? `\nAcompanhe aqui: ${dados.linkRastreio}` : ''}\n\nQualquer dúvida, é só me chamar por aqui 💛`;
  }
  return null;
}

/**
 * Aviso pela Evolution (WhatsApp conectado por QR Code), quando a API oficial não está configurada.
 * Devolve false se não há texto para o evento, a Evolution não está ligada ou o número não tem WhatsApp.
 */
export async function enviarPelaEvolution(evento: Evento, pedido: WcPedido, dados: DadosAviso): Promise<boolean> {
  const texto = textoEvolution(evento, pedido, dados);
  const para = telefoneWhatsapp(pedido.billing.phone || '');
  if (!texto || !para || !integracoes.evolution()) return false;
  if ((await temWhatsapp(para).catch(() => null)) === false) return false;
  // Import dinâmico: atendimento.ts importa este arquivo. enviarAoCliente marca a mensagem como do robô,
  // para o eco dela no webhook não ser confundido com uma pessoa da loja assumindo a conversa.
  const { enviarAoCliente } = await import('./atendimento');
  const id = await enviarAoCliente(para, texto);
  await registrarSaida(para, texto, 'aviso', id).catch(() => {});
  return true;
}

export async function enviarEmail(para: string, assunto: string, html: string): Promise<boolean> {
  if (!integracoes.email() || !para) return false;
  // RESEND_API_URL só para testes locais
  const res = await fetch(`${process.env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.email.remetente, to: [para], subject: assunto, html }),
  });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error(`E-mail: ${erro.message || res.status}`);
  }
  return true;
}

export function escapar(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function emailCliente(evento: Evento, pedido: WcPedido, dados: DadosAviso): { assunto: string; corpo: string } {
  const nome = escapar(primeiroNome(pedido));
  const n = pedido.id;
  const itens = pedido.line_items.map((i) => `<li>${i.quantity}x ${escapar(i.name)}</li>`).join('');
  const botao = (href: string, texto: string) =>
    `<p><a href="${escapar(href)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${texto}</a></p>`;

  switch (evento) {
    case 'recebido':
      return {
        assunto: `Recebemos seu pedido #${n}`,
        corpo: `<p>Oi, ${nome}! Recebemos seu pedido <b>#${n}</b> (${brl(pedido.total)}).</p><ul>${itens}</ul><p>Assim que o pagamento for confirmado, te avisamos.</p>`,
      };
    case 'pago':
      return {
        assunto: `Pagamento aprovado — pedido #${n}`,
        corpo: `<p>Oi, ${nome}! O pagamento do pedido <b>#${n}</b> foi aprovado. 🎉</p><ul>${itens}</ul><p>Agora é com a gente: vamos separar e enviar. Você recebe o código de rastreio assim que postarmos.</p>`,
      };
    case 'enviado':
      return {
        assunto: `Seu pedido #${n} foi enviado`,
        corpo: `<p>Oi, ${nome}! Seu pedido <b>#${n}</b> está a caminho.</p><p>Código de rastreio: <b>${escapar(dados.rastreio || '')}</b></p>${dados.linkRastreio ? botao(dados.linkRastreio, 'Acompanhar entrega') : ''}`,
      };
    case 'pixLembrete':
      return {
        assunto: `Seu Pix do pedido #${n} ainda está pendente`,
        corpo: `<p>Oi, ${nome}! Vimos que o pagamento do pedido <b>#${n}</b> (${brl(pedido.total)}) ainda não foi concluído.</p><ul>${itens}</ul>${dados.linkPagamento ? botao(dados.linkPagamento, 'Pagar agora') : ''}<p>Se já pagou, pode ignorar esta mensagem.</p>`,
      };
  }
}

/** Envia o aviso por todos os canais configurados. Retorna os canais usados. */
export async function avisarCliente(evento: Evento, pedido: WcPedido, dados: DadosAviso = {}): Promise<string[]> {
  const canais: string[] = [];
  const erros: string[] = [];

  try {
    if (await enviarWhatsapp(evento, pedido, dados)) canais.push('whatsapp');
  } catch (e) {
    erros.push((e as Error).message);
  }

  if (config.avisos.eventosEmail.includes(evento)) {
    try {
      const { assunto, corpo } = emailCliente(evento, pedido, dados);
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px">${corpo}<p style="color:#888;font-size:13px">${escapar(config.lojaNome)} · ${escapar(config.siteUrl)}</p></div>`;
      if (await enviarEmail(pedido.billing.email || '', assunto, html)) canais.push('email');
    } catch (e) {
      erros.push((e as Error).message);
    }
  }

  if (canais.length === 0 && erros.length) throw new Error(erros.join(' | '));
  return canais;
}

/** Alerta interno para o e-mail da loja (EMAIL_ADMIN). Nunca lança erro. */
export async function alertarLoja(assunto: string, html: string): Promise<void> {
  try {
    if (config.email.admin) await enviarEmail(config.email.admin, `[${config.lojaNome}] ${assunto}`, html);
  } catch (e) {
    console.error('Falha ao alertar a loja:', (e as Error).message);
  }
}
