// Cliente mínimo da WhatsApp Cloud API (Meta).
//
// Regras da Meta que importam aqui:
// - Mensagem iniciada pela loja só pode ser TEMPLATE aprovado.
// - Texto livre só pode ir para quem mandou mensagem à loja nas últimas 24 horas ("janela de 24h").
import { config, integracoes } from './config';

/**
 * Normaliza para o formato internacional só com dígitos (55 + DDD + número).
 * Número escrito com "+" (ou 00) de outro país, ex.: +598 99 280 967 (Uruguai), fica como está:
 * sem isso, um número estrangeiro de 10-11 dígitos ganharia um "55" na frente e viraria outro número.
 */
export function telefoneWhatsapp(telefone: string): string | null {
  const bruto = (telefone || '').trim();
  let d = bruto.replace(/\D/g, '');
  const internacional = bruto.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  if (internacional && !d.startsWith('55')) return d.length >= 8 && d.length <= 15 ? d : null;
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1); // 021...
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 ? d : null;
}

/**
 * Telefone brasileiro que parece digitado errado (para avisar no painel). Devolve o motivo ou null.
 * Caso comum: o cliente digita o 55 do país e o checkout antigo cortava o fim do número.
 */
export function telefoneSuspeito(telefone: string): string | null {
  const bruto = (telefone || '').trim();
  if (!bruto) return 'sem telefone';
  const d = bruto.replace(/\D/g, '');
  if (bruto.startsWith('+') && !d.startsWith('55')) return null; // outro país
  const local = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d.replace(/^0/, '');
  if (local.length < 10) return 'número curto demais';
  if (!/^[1-9][1-9]/.test(local)) return 'DDD inválido';
  if (local.length === 11 && local[2] !== '9')
    return 'celular deve ter 9 depois do DDD: o número pode ter sido cortado (cliente digitou o 55 do país) ou ser de outro país';
  if (local.length > 11) return 'número comprido demais';
  return null;
}

/**
 * Chave para comparar telefones brasileiros: DDD + últimos 8 dígitos.
 * O WhatsApp às vezes informa o celular sem o 9 extra (5521xxxxxxxx), e o cliente
 * digita com o 9 no checkout. Assim os dois formatos batem.
 */
export function chaveTelefone(telefone: string): string | null {
  const d = telefoneWhatsapp(telefone);
  if (!d) return null;
  if (!d.startsWith('55')) return d;
  const local = d.slice(2);
  return local.slice(0, 2) + local.slice(-8);
}

/** O texto de uma variável de template não pode ter quebra de linha, tab nem 4+ espaços seguidos, nem ficar vazio. */
export function limparParametro(texto: string): string {
  const t = (texto || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return t || '-';
}

type RespostaMeta = { messages?: { id: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } };

async function chamarApi(corpo: Record<string, unknown>): Promise<string | undefined> {
  if (!integracoes.whatsapp()) throw new Error('WhatsApp não configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');
  const res = await fetch(
    `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
      cache: 'no-store',
    }
  );
  const json = (await res.json().catch(() => ({}))) as RespostaMeta;
  if (!res.ok || json.error) {
    const e = json.error;
    const detalhe = e?.error_data?.details ? ` — ${e.error_data.details}` : '';
    throw new Error(`${e?.message || `HTTP ${res.status}`}${e?.code ? ` (código ${e.code})` : ''}${detalhe}`);
  }
  return json.messages?.[0]?.id;
}

export function enviarTemplate(para: string, nome: string, parametros: string[]): Promise<string | undefined> {
  return chamarApi({
    to: para,
    type: 'template',
    template: {
      name: nome,
      language: { code: config.whatsapp.idioma },
      components: parametros.length
        ? [{ type: 'body', parameters: parametros.map((p) => ({ type: 'text', text: limparParametro(p) })) }]
        : [],
    },
  });
}

/** Texto livre. Só funciona dentro da janela de 24h do destinatário. */
export function enviarTexto(para: string, texto: string): Promise<string | undefined> {
  return chamarApi({ to: para, type: 'text', text: { body: texto.slice(0, 4096), preview_url: true } });
}

/** Marca a mensagem recebida como lida (os dois tracinhos azuis para o cliente). */
export async function marcarComoLida(idMensagem: string): Promise<void> {
  try {
    await chamarApi({ status: 'read', message_id: idMensagem });
  } catch {
    // não é importante
  }
}
