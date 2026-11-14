// Rotinas periódicas das automações.
//
//   GET /api/cron/automacao                 → roda tudo
//   GET /api/cron/automacao?tarefa=pedidos  → só reprocessa pedidos pagos (Bling, envio, rastreio)
//   GET /api/cron/automacao?tarefa=pix      → só lembretes de Pix não pago
//   GET /api/cron/automacao?tarefa=estoque  → só sincroniza estoque Bling → WooCommerce
//   GET /api/cron/automacao?tarefa=alertas  → só alertas ao dono (Pix parado, estoque, resumo do dia)
//   GET /api/cron/automacao?tarefa=saude    → só a checagem de saúde (loja, WooCommerce, frete, banco)
//   GET /api/cron/automacao?tarefa=abandono → só os e-mails de carrinho abandonado
//   GET /api/cron/automacao?tarefa=diagnostico → confere a configuração do Bling (só leitura)
//   GET /api/cron/automacao?tarefa=lembretes → lembretes pelo WhatsApp (Pix, cartão recusado, carrinho)
//   GET /api/cron/automacao?tarefa=analise-anuncios → análise dos anúncios com IA (a cada 8 h)
//   GET /api/cron/automacao?modo=fundo     → responde na hora e roda em segundo plano
//                                            (para o cron-job.org, que espera no máximo 30 s)
//
// Protegido por CRON_SECRET: header "Authorization: Bearer <CRON_SECRET>" (a Vercel manda sozinha).
import crypto from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { config, integracoes } from '../../../../lib/automacao/config';
import { diagnosticoBling } from '../../../../lib/automacao/diagnostico';
import { sincronizarEstoque } from '../../../../lib/automacao/estoque';
import { rotinaAbandono } from '../../../../lib/automacao/abandono';
import { alertasLigados, preferenciasAlertas, rotinaAlertas } from '../../../../lib/automacao/alertas';
import { rotinaSaude } from '../../../../lib/automacao/saude';
import { registrarExecucao } from '../../../../lib/automacao/monitor';
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
  const emFundo = params.get('modo') === 'fundo' && tarefa !== 'diagnostico' && tarefa !== 'auditoria' && tarefa !== 'diagnostico-me' && tarefa !== 'diagnostico-rastreio';
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
    // Saúde primeiro (rápida): loja, WooCommerce, frete e banco
    if (tarefa === 'todas' || tarefa === 'saude' || tarefa === 'alertas') {
      await rodar('saude', async () => rotinaSaude(alertasLigados() && (await preferenciasAlertas()).saude));
    }
    if (tarefa === 'todas' || tarefa === 'abandono') await rodar('abandono', () => rotinaAbandono(prazo));
    if (tarefa === 'todas' || tarefa === 'alertas') await rodar('alertas', () => rotinaAlertas(prazo));
    // Lembretes pelo WhatsApp (Pix não pago, cartão recusado, carrinho): só com WHATSAPP_LEMBRETES=true
    if (tarefa === 'todas' || tarefa === 'lembretes') {
      await rodar('lembretes', async () => (await import('../../../../lib/automacao/lembretesWhats')).rotinaLembretesWhats(prazo));
    }
    // Só roda quando pedido explicitamente (não entra em "todas").
    if (tarefa === 'diagnostico') await rodar('diagnostico', () => diagnosticoBling());
    if (tarefa === 'diagnostico-rastreio') await rodar('rastreioBling', async () => (await import('../../../../lib/automacao/diagnosticoBlingRastreio')).diagnosticoBlingRastreio());
    if (tarefa === 'diagnostico-me') await rodar('diagnosticoME', async () => (await import('../../../../lib/automacao/diagnosticoME')).diagnosticoMelhorEnvio());
    // Análise dos anúncios com IA (a cada 8 h; ?forcar=1 roda na hora). Fora de "todas" porque pode levar ~40 s.
    if (tarefa === 'analise-anuncios') {
      await rodar('analiseAnuncios', async () =>
        (await import('../../../../lib/automacao/agenteAnuncios')).rotinaAnaliseAnuncios(params.get('forcar') === '1')
      );
    }
    if (tarefa === 'auditoria') await rodar('auditoria', async () => (await import('../../../../lib/automacao/auditoria')).auditoria());
    const falhas = Object.entries(resultado).filter(([, v]) => v && typeof v === 'object' && 'erro' in (v as object));
    await registrarExecucao('cron', falhas.length === 0, falhas.map(([k, v]) => `${k}: ${(v as { erro: string }).erro}`).join(' | ') || tarefa);
    console.log('[automacao] cron', tarefa, emFundo ? '(segundo plano)' : '', JSON.stringify(resultado));
  };

  if (emFundo) {
    after(executar);
    return NextResponse.json({ ok: true, tarefa, modo: 'fundo', mensagem: 'rotina iniciada em segundo plano' });
  }
  await executar();
  return NextResponse.json({ ok: true, tarefa, resultado });
}
