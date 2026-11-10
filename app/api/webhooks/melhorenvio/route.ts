// Recebe os webhooks do Melhor Envio (mudanças de status da etiqueta) para o rastreio chegar
// ao cliente assim que a encomenda é postada, sem esperar a rotina de 30 minutos.
//
// Configurar em: Melhor Envio → Integrações → Área Dev → seu aplicativo → Novo webhook
//   URL: https://SEU-SITE/api/webhooks/melhorenvio
//   O Melhor Envio assina o corpo com o client secret do aplicativo (header X-ME-Signature).
//   Coloque esse secret em MELHOR_ENVIO_WEBHOOK_SECRET.
//
// Só chegam eventos de envios criados com um token desse mesmo aplicativo.
// A rotina de 30 minutos continua como reserva.
import { after, NextResponse } from 'next/server';
import * as melhorEnvio from '../../../../lib/automacao/melhorenvio';
import { alertarLoja } from '../../../../lib/automacao/notificacoes';
import { M, processarPedido } from '../../../../lib/automacao/pedidos';
import { adicionarNota, meta, obterPedido } from '../../../../lib/automacao/woocommerce';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Evento = {
  event?: string;
  data?: { id?: string; status?: string; tracking?: string | null; self_tracking?: string | null; tags?: unknown };
};

// Eventos que não pedem nenhuma ação (envio ainda no carrinho).
const IGNORAR = ['order.created', 'order.pending'];

export async function POST(request: Request) {
  const corpo = await request.text();

  if (!melhorEnvio.assinaturaWebhookValida(corpo, request.headers.get('x-me-signature'))) {
    return NextResponse.json({ ok: false, error: 'assinatura inválida' }, { status: 401 });
  }

  let evento: Evento = {};
  try {
    evento = corpo ? JSON.parse(corpo) : {};
  } catch {
    return NextResponse.json({ ok: true, ignorado: 'corpo inválido' });
  }

  const nome = evento.event || '';
  const envio = evento.data;
  const idPedido = melhorEnvio.pedidoDaTag(envio?.tags);
  if (!envio?.id || !idPedido) return NextResponse.json({ ok: true, ignorado: 'sem envio ou pedido' });
  if (IGNORAR.includes(nome)) return NextResponse.json({ ok: true, ignorado: nome });

  // O Melhor Envio espera resposta em até 6 s; o resto roda em segundo plano.
  after(async () => {
    try {
      const pedido = await obterPedido(idPedido);
      if (meta(pedido, M.meEnvio) !== envio.id) {
        console.log('[automacao] webhook melhor envio: envio não pertence ao pedido', idPedido, envio.id);
        return;
      }

      if (nome === 'order.cancelled') {
        await adicionarNota(pedido, `Envio ${envio.id} cancelado no Melhor Envio.`);
        await alertarLoja(`Envio cancelado — pedido #${pedido.id}`, `<p>O envio do pedido #${pedido.id} foi cancelado no Melhor Envio.</p>`);
        return;
      }
      if (['order.undelivered', 'order.paused', 'order.suspended'].includes(nome)) {
        await adicionarNota(pedido, `Melhor Envio: ${nome.replace('order.', '')} (envio ${envio.id}).`);
        await alertarLoja(
          `Problema na entrega — pedido #${pedido.id}`,
          `<p>O Melhor Envio informou "${nome}" para o pedido #${pedido.id}. Confira no painel do Melhor Envio.</p>`
        );
      }

      const codigo = melhorEnvio.codigoDoEnvio({
        status: envio.status || nome.replace('order.', ''),
        tracking: envio.tracking,
        self_tracking: envio.self_tracking,
      });
      const rel = await processarPedido(idPedido, { rastreioMelhorEnvio: codigo || undefined });
      console.log('[automacao] webhook melhor envio', nome, JSON.stringify(rel));
    } catch (e) {
      console.error('[automacao] webhook melhor envio', nome, (e as Error).message);
    }
  });

  return NextResponse.json({ ok: true, pedido: idPedido, evento: nome });
}
