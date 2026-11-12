// Registro leve de "última vez que rodou" (cron, webhooks, alertas) para o monitoramento do painel.
import { kvGet, kvSet } from './kv';

export type Execucao = { em: number; ok: boolean; detalhe?: string };

export type NomeMonitor = 'cron' | 'webhook-woo' | 'alerta';

export async function registrarExecucao(nome: NomeMonitor, ok = true, detalhe?: string): Promise<void> {
  try {
    await kvSet(`monitor:${nome}`, { em: Date.now(), ok, detalhe: detalhe?.slice(0, 300) } satisfies Execucao, 30 * 86_400);
  } catch {
    // o monitoramento nunca derruba a rotina
  }
}

export async function ultimaExecucao(nome: NomeMonitor): Promise<Execucao | null> {
  try {
    return await kvGet<Execucao>(`monitor:${nome}`);
  } catch {
    return null;
  }
}
