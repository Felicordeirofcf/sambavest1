// Recebe os webhooks do WooCommerce (Pedido criado / Pedido atualizado) e dispara as automações.
//
// Configurar em: WooCommerce → Configurações → Avançado → Webhooks
//   URL de entrega: https://SEU-SITE/api/webhooks/woocommerce
//   Segredo: o mesmo valor de WC_WEBHOOK_SECRET
import crypto from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { config } from '../../../../lib/automacao/config';
import { processarPedido } from '../../../../lib/automacao/pedidos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function assinaturaValida(corpo: string, assinatura: string | null): boolean {
  if (!config.woo.webhookSecret || !assinatura) return false;
  const esperada = crypto.createHmac('sha256', config.woo.webhookSecret).update(corpo, 'utf8').digest('base64');
  const a = Buffer.from(esperada);
  const b = Buffer.from(assinatura);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const corpo = await request.text();

  // Ao criar o webhook, o WooCommerce manda um "ping" (webhook_id=123) para testar a URL.
  if (corpo.startsWith('webhook_id=')) return NextResponse.json({ ok: true, ping: true });

  if (!assinaturaValida(corpo, request.headers.get('x-wc-webhook-signature'))) {
    return NextResponse.json({ ok: false, error: 'assinatura inválida' }, { status: 401 });
  }

  let id: number | undefined;
  try {
    id = Number(JSON.parse(corpo).id);
  } catch {
    // corpo inválido
  }
  if (!id) return NextResponse.json({ ok: true, ignorado: 'sem id de pedido' });

  // Responde rápido para o WooCommerce (ele desativa webhooks que demoram/falham)
  // e processa em segundo plano. Os dados do pedido são buscados de novo na API.
  after(async () => {
    const rel = await processarPedido(id!);
    console.log('[automacao] webhook', JSON.stringify(rel));
  });

  return NextResponse.json({ ok: true, pedido: id });
}
