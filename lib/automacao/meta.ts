// Meta (Facebook/Instagram) — API de Conversões.
//
// Envia o evento "Purchase" direto do servidor quando o pagamento é aprovado.
// O Pixel do navegador não vê a compra: o pagamento acontece na página da AppMax.
// Dados pessoais vão com hash SHA-256, como a Meta exige.
import crypto from 'node:crypto';
import { config } from './config';
import { documentoCliente, meta, WcPedido } from './woocommerce';

export const META_CAMPOS = {
  fbp: '_sv_meta_fbp',
  fbc: '_sv_meta_fbc',
  ip: '_sv_meta_ip',
  userAgent: '_sv_meta_ua',
  eventId: '_sv_meta_event_id',
  url: '_sv_meta_url',
} as const;

function hash(valor: string | undefined | null): string | undefined {
  const v = (valor || '').trim().toLowerCase();
  return v ? crypto.createHash('sha256').update(v, 'utf8').digest('hex') : undefined;
}

function cookie(header: string, nome: string): string | undefined {
  const m = header.match(new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

/**
 * Para o checkout: coleta cookies do Pixel, IP e navegador do comprador e devolve
 * itens de meta_data para gravar no pedido do WooCommerce. Assim, quando o pagamento
 * for aprovado (minutos ou horas depois), a compra é atribuída ao anúncio certo.
 */
export function metaDadosRastreio(request: Request, eventId?: string): { key: string; value: string }[] {
  const h = request.headers;
  const cookies = h.get('cookie') || '';
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '';
  const valores: Record<string, string | undefined> = {
    [META_CAMPOS.fbp]: cookie(cookies, '_fbp'),
    [META_CAMPOS.fbc]: cookie(cookies, '_fbc'),
    [META_CAMPOS.ip]: ip,
    [META_CAMPOS.userAgent]: (h.get('user-agent') || '').slice(0, 400),
    [META_CAMPOS.eventId]: eventId,
    [META_CAMPOS.url]: h.get('referer') || undefined,
  };
  return Object.entries(valores)
    .filter(([, v]) => v)
    .map(([key, value]) => ({ key, value: value! }));
}

function telefoneE164(t: string | undefined): string | undefined {
  let d = (t || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d || undefined;
}

/** Envia a compra para a API de Conversões. Retorna o event_id usado. */
export async function enviarCompra(pedido: WcPedido): Promise<string> {
  const { pixelId, capiToken, testEventCode } = config.meta;
  if (!pixelId || !capiToken) throw new Error('META_PIXEL_ID / META_CAPI_TOKEN não configurados.');

  const b = pedido.billing;
  const eventId = `pedido_${pedido.id}`;
  const pagoEm = pedido.date_paid_gmt || pedido.date_created_gmt;
  let eventTime = Math.floor(new Date(pagoEm + 'Z').getTime() / 1000);
  // A Meta recusa eventos com mais de 7 dias
  const agora = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(eventTime) || eventTime > agora || agora - eventTime > 6 * 86400) eventTime = agora;

  const userData: Record<string, unknown> = {
    em: [hash(b.email)].filter(Boolean),
    ph: [hash(telefoneE164(b.phone))].filter(Boolean),
    fn: [hash(b.first_name)].filter(Boolean),
    ln: [hash(b.last_name)].filter(Boolean),
    ct: [hash((b.city || '').replace(/\s/g, ''))].filter(Boolean),
    st: [hash(b.state)].filter(Boolean),
    zp: [hash((b.postcode || '').replace(/\D/g, ''))].filter(Boolean),
    country: [hash('br')],
    external_id: [hash(documentoCliente(pedido) || b.email)].filter(Boolean),
    fbp: meta(pedido, META_CAMPOS.fbp),
    fbc: meta(pedido, META_CAMPOS.fbc),
    client_ip_address: meta(pedido, META_CAMPOS.ip),
    client_user_agent: meta(pedido, META_CAMPOS.userAgent),
  };
  for (const k of Object.keys(userData)) {
    const v = userData[k];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete userData[k];
  }

  const itens = pedido.line_items.map((i) => ({
    id: String(i.variation_id || i.product_id),
    quantity: i.quantity,
    item_price: Number((Number(i.total) / i.quantity).toFixed(2)),
  }));

  const corpo = {
    data: [
      {
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: eventId,
        action_source: 'website',
        event_source_url: meta(pedido, META_CAMPOS.url) || `${config.siteUrl}/checkout`,
        user_data: userData,
        custom_data: {
          currency: 'BRL',
          value: Number(pedido.total),
          order_id: String(pedido.id),
          content_type: 'product',
          content_ids: itens.map((i) => i.id),
          contents: itens,
          num_items: itens.reduce((s, i) => s + i.quantity, 0),
        },
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(capiToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta CAPI: ${json.error?.error_user_msg || json.error?.message || res.status}`);
  return eventId;
}

// ---------- Origem do pedido (de qual anúncio/campanha o cliente veio) ----------

export const CAMPOS_ORIGEM = {
  source: '_sv_origem_source',
  medium: '_sv_origem_medium',
  campaign: '_sv_origem_campaign',
  content: '_sv_origem_content',
} as const;

const textoOrigem = (v: unknown) =>
  typeof v === 'string' ? v.replace(/[^\w\-.:/ |{}À-ÿ—–]/g, '').trim().slice(0, 80) || undefined : undefined;

/**
 * Metadados de origem para o pedido: o que o navegador guardou do link (UTM) nos últimos 7 dias;
 * sem isso, o cookie de clique da Meta (_fbc, criado quando a pessoa clica num anúncio) dos últimos 7 dias.
 */
export function metaOrigem(origem: unknown, request: Request): { key: string; value: string }[] {
  const o = (origem && typeof origem === 'object' ? origem : {}) as Record<string, unknown>;
  let valores: Record<string, string | undefined> = {
    [CAMPOS_ORIGEM.source]: textoOrigem(o.source)?.toLowerCase(),
    [CAMPOS_ORIGEM.medium]: textoOrigem(o.medium),
    [CAMPOS_ORIGEM.campaign]: textoOrigem(o.campaign),
    [CAMPOS_ORIGEM.content]: textoOrigem(o.content),
  };
  if (!valores[CAMPOS_ORIGEM.source]) {
    // _fbc = fb.1.<ms do clique>.<fbclid>
    const fbc = cookie(request.headers.get('cookie') || '', '_fbc');
    const clique = Number(fbc?.split('.')[2]);
    if (clique && Date.now() - clique < 7 * 86_400_000) valores = { [CAMPOS_ORIGEM.source]: 'meta', [CAMPOS_ORIGEM.medium]: 'clique' };
  }
  return Object.entries(valores)
    .filter(([, v]) => v)
    .map(([key, value]) => ({ key, value: value! }));
}
