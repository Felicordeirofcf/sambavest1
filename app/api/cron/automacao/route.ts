// Rotinas periódicas das automações.
//
//   GET /api/cron/automacao                 → roda tudo
//   GET /api/cron/automacao?tarefa=pedidos  → só reprocessa pedidos pagos (Bling, envio, rastreio)
//   GET /api/cron/automacao?tarefa=pix      → só lembretes de Pix não pago
//   GET /api/cron/automacao?tarefa=estoque  → só sincroniza estoque Bling → WooCommerce
//   GET /api/cron/automacao?tarefa=diagnostico → confere a configuração do Bling (só leitura)
//   GET /api/cron/automacao?modo=fundo     → responde na hora e roda em segundo plano
//                                            (para o cron-job.org, que espera no máximo 30 s)
//
// Protegido por CRON_SECRET: header "Authorization: Bearer <CRON_SECRET>" (a Vercel manda sozinha).
import crypto from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { config, integracoes } from '../../../../lib/automacao/config';
import { diagnosticoBling } from '../../../../lib/automacao/diagnostico';
import { sincronizarEstoque } from '../../../../lib/automacao/estoque';
import { rotinaPedidos, rotinaPix } from '../../../../lib/automacao/pedidos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const recebido = Buffer.from(request.headers.get('authorization') || '');
  const esperado = Buffer.from(`Bearer ${config.cronSecret}`);
  if (!config.cronSecret || recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 });
  }
  if (!integracoes.woo()) {
    return NextResponse.json({ ok: false, error: 'WooCommerce não configurado' }, { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const tarefa = params.get('tarefa') || 'todas';
  const emFundo = params.get('modo') === 'fundo' && tarefa !== 'diagnostico';
  // Em segundo plano o relógio começa na resposta; o limite da função continua sendo 60 s.
  const prazo = Date.now() + (emFundo ? 40_000 : 45_000);
  const resultado: Record<string, unknown> = {};

  const rodar = async (nome: string, fn: () => Promise<unknown>) => {
    try {
      resultado[nome] = await fn();
    } catch (e) {
      resultado[nome] = { erro: (e as Error).message };
    }
  };

  const executar = async () => {
    if (tarefa === 'todas' || tarefa === 'pedidos') await rodar('pedidos', () => rotinaPedidos(prazo));
    if (tarefa === 'todas' || tarefa === 'pix') await rodar('pix', () => rotinaPix(prazo));
    if ((tarefa === 'todas' || tarefa === 'estoque') && integracoes.bling() && config.bling.sincronizarEstoque) {
      await rodar('estoque', () => sincronizarEstoque());
    }
    // Só roda quando pedido explicitamente (não entra em "todas").
    if (tarefa === 'diagnostico') await rodar('diagnostico', () => diagnosticoBling());
    console.log('[automacao] cron', tarefa, emFundo ? '(segundo plano)' : '', JSON.stringify(resultado));
  };

  if (emFundo) {
    after(executar);
    return NextResponse.json({ ok: true, tarefa, modo: 'fundo', mensagem: 'rotina iniciada em segundo plano' });
  }
  await executar();
  return NextResponse.json({ ok: true, tarefa, resultado });
}
