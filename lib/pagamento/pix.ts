// Gera o Pix "por trás" do site: o cliente fica no sambavest.com e o servidor faz, no WordPress, o mesmo
// que o clique em "Pagar pedido" faria (abre a página de pagamento do pedido, pega o código de segurança
// e envia a escolha do Pix). O plugin da AppMax gera o Pix e grava o código no pedido; aqui só lemos.
//
// Nunca lança erro por falha do WordPress: devolve `ok: false` e a tela cai na página de pagamento de hoje.
import crypto from 'crypto';
import { config } from '../automacao/config';
import { adquirirTrava, liberarTrava } from '../automacao/kv';
import { registrarFalha } from '../automacao/monitor';
import { meta, obterPedido, WcPedido } from '../automacao/woocommerce';

const GATEWAY_PIX = () => process.env.APPMAX_GATEWAY_PIX?.trim() || 'pagamentos_para_woocommerce_com_appmax_pix';
const base = () => (process.env.WP_BACKEND_URL || config.woo.url).replace(/\/$/, '');

export const META_CODIGO = '_pagamentos_para_woocommerce_com_appmax_payment_code';
export const META_IMAGEM = '_pagamentos_para_woocommerce_com_appmax_media';

export type DadosPix = {
  ok: boolean;
  numero?: number;
  total?: number;
  pago?: boolean;
  codigo?: string;
  imagem?: string;
  /** Página de pagamento do WordPress (plano B) */
  fallback?: string;
  motivo?: string;
};

export const linkWordpress = (p: WcPedido) => `${base()}/finalizar-compra/order-pay/${p.id}/?pay_for_order=true&key=${p.order_key}`;

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const entidades = (t: string) => t.replace(/&amp;|&#0?38;/g, '&').replace(/&quot;|&#0?34;/g, '"').replace(/&#0?39;|&#x27;/g, "'");
const attr = (tag: string, nome: string) => entidades(tag.match(new RegExp(`\\b${nome}=["']([^"']*)["']`, 'i'))?.[1] || '');

/** Imagem do QR: o plugin grava uma URL (ou, em versões antigas, o PNG em base64). */
const imagemDoQr = (v?: string) => (!v ? undefined : /^(https?:|data:)/i.test(v) ? v : `data:image/png;base64,${v}`);

function ler(p: WcPedido): Pick<DadosPix, 'codigo' | 'imagem'> {
  return { codigo: meta(p, META_CODIGO), imagem: imagemDoQr(meta(p, META_IMAGEM)) };
}

const PAGOS = ['processing', 'completed'];

/** Confere pedido + chave e devolve o que a tela precisa. `pedido` é null se a chave não bate. */
export async function carregarPedido(id: number, chave: string): Promise<{ pedido: WcPedido | null; motivo?: string }> {
  if (!Number.isInteger(id) || id <= 0 || !chave) return { pedido: null, motivo: 'link inválido' };
  let pedido: WcPedido;
  try {
    pedido = await obterPedido(id);
  } catch {
    return { pedido: null, motivo: 'pedido não encontrado' };
  }
  if (!pedido?.order_key || !iguais(pedido.order_key, chave)) return { pedido: null, motivo: 'link inválido' };
  return { pedido };
}

function resposta(p: WcPedido): DadosPix {
  const d = ler(p);
  return { ok: true, numero: p.id, total: Number(p.total) || 0, pago: PAGOS.includes(p.status), fallback: linkWordpress(p), ...d };
}

/** Só leitura: situação do pedido e do Pix (usada pela tela a cada poucos segundos). */
export async function situacaoPix(id: number, chave: string): Promise<DadosPix> {
  const { pedido, motivo } = await carregarPedido(id, chave);
  if (!pedido) return { ok: false, motivo };
  return resposta(pedido);
}

/** Pede ao WordPress para gerar o Pix (uma vez só por pedido) e devolve o código. */
export async function gerarPix(id: number, chave: string): Promise<DadosPix> {
  const { pedido, motivo } = await carregarPedido(id, chave);
  if (!pedido) return { ok: false, motivo };
  const atual = resposta(pedido);
  if (atual.pago || atual.codigo) return atual;
  if (!/pix/i.test(pedido.payment_method) || !['pending', 'on-hold', 'failed'].includes(pedido.status)) {
    return { ...atual, ok: false, motivo: 'pedido não é um Pix a pagar' };
  }

  // Só uma geração por vez: dois cliques ou duas abas não criam dois Pix na AppMax
  if (!(await adquirirTrava(`pix:${id}`, 60))) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const p = await obterPedido(id).catch(() => null);
      if (p && ler(p).codigo) return resposta(p);
    }
    return { ...atual, ok: false, motivo: 'a geração está demorando' };
  }
  try {
    const url = linkWordpress(pedido);
    const cab = { 'User-Agent': 'Mozilla/5.0 (SambaVest-Pix)', Accept: 'text/html' };

    // 1) Abre a página de pagamento (o WordPress entrega o cookie de sessão e o código de segurança)
    const abrir = await fetch(url, { cache: 'no-store', redirect: 'manual', headers: cab, signal: AbortSignal.timeout(25_000) });
    if (abrir.status !== 200) throw new Error(`página de pagamento respondeu ${abrir.status}`);
    const cookie = (abrir.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    const html = await abrir.text();
    const form = html.match(/<form\b[^>]*id=["']order_review["'][\s\S]*?<\/form>/i)?.[0];
    if (!form) throw new Error('formulário de pagamento não encontrado');

    // 2) Mesmos campos escondidos que o navegador enviaria (código de segurança, etc.). Nada de cartão.
    const corpo = new URLSearchParams();
    for (const m of form.matchAll(/<input\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/type=["']hidden["']/i.test(tag)) continue;
      const nome = attr(tag, 'name');
      if (nome) corpo.set(nome, attr(tag, 'value'));
    }
    if (!corpo.get('woocommerce-pay-nonce')) throw new Error('código de segurança não encontrado');
    corpo.set('payment_method', GATEWAY_PIX());
    corpo.set('woocommerce_pay', '1');

    // 3) Envia a escolha do Pix. O plugin gera o Pix e responde com um redirecionamento.
    const enviar = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'manual',
      headers: { ...cab, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, Referer: url, Origin: base() },
      body: corpo.toString(),
      signal: AbortSignal.timeout(45_000),
    });
    if (enviar.status >= 500) throw new Error(`pagamento respondeu ${enviar.status}`);

    // 4) Lê o código gravado no pedido (alguns segundos de tolerância)
    for (let i = 0; i < 6; i++) {
      const p = await obterPedido(id);
      if (ler(p).codigo) return resposta(p);
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error('o Pix não foi gerado');
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error('[pix] falha ao gerar:', msg);
    await registrarFalha('pix-erro', msg);
    return { ...atual, ok: false, motivo: msg };
  } finally {
    await liberarTrava(`pix:${id}`);
  }
}
