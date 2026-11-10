// Rotinas periódicas das automações.
//
//   GET /api/cron/automacao                 → roda tudo
//   GET /api/cron/automacao?tarefa=pedidos  → só reprocessa pedidos pagos (Bling, envio, rastreio)
//   GET /api/cron/automacao?tarefa=pix      → só lembretes de Pix não pago
//   GET /api/cron/automacao?tarefa=estoque  → só sincroniza estoque Bling → WooCommerce
//
// Protegido por CRON_SECRET: header "Authorization: Bearer <CRON_SECRET>" (a Vercel manda sozinha).
import { NextResponse } from 'next/server';
import { config, integracoes } from '../../../../lib/automacao/config';
import { sincronizarEstoque } from '../../../../lib/automacao/estoque';
import { rotinaPedidos, rotinaPix } from '../../../../lib/automacao/pedidos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!config.cronSecret || request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 });
  }
  if (!integracoes.woo()) {
    return NextResponse.json({ ok: false, error: 'WooCommerce não configurado' }, { status: 500 });
  }

  const tarefa = new URL(request.url).searchParams.get('tarefa') || 'todas';
  const prazo = Date.now() + 45_000; // deixa folga antes do limite de 60s
  const resultado: Record<string, unknown> = {};

  const rodar = async (nome: string, fn: () => Promise<unknown>) => {
    try {
      resultado[nome] = await fn();
    } catch (e) {
      resultado[nome] = { erro: (e as Error).message };
    }
  };

  if (tarefa === 'todas' || tarefa === 'pedidos') await rodar('pedidos', () => rotinaPedidos(prazo));
  if (tarefa === 'todas' || tarefa === 'pix') await rodar('pix', () => rotinaPix(prazo));
  if ((tarefa === 'todas' || tarefa === 'estoque') && integracoes.bling() && config.bling.sincronizarEstoque) {
    await rodar('estoque', () => sincronizarEstoque());
  }

  console.log('[automacao] cron', tarefa, JSON.stringify(resultado));
  return NextResponse.json({ ok: true, tarefa, resultado });
}
