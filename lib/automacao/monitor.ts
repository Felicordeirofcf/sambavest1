// Registro leve de "última vez que rodou" (cron, webhooks, alertas) para o monitoramento do painel.
import { kvGet, kvIncr, kvMGet, kvSet } from './kv';

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

// ---------- Falhas que impedem a venda (contadas por dia) ----------

export const TIPOS_FALHA = {
  'frete-erro': 'Erro ao calcular o frete',
  'frete-vazio': 'Nenhuma opção de frete para o CEP',
  'checkout-recusado': 'Checkout recusou o pedido (produto indisponível, frete não escolhido...)',
  'checkout-erro': 'Erro ao criar o pedido (WooCommerce/servidor)',
} as const;
export type TipoFalha = keyof typeof TIPOS_FALHA;

const diaSP = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const chaveFalha = (dia: string, tipo: TipoFalha) => `falhas:${dia}:${tipo}`;

/** Conta mais uma falha de hoje. Nunca lança erro. */
export async function registrarFalha(tipo: TipoFalha, detalhe?: string): Promise<void> {
  try {
    await kvIncr(chaveFalha(diaSP(), tipo));
    if (detalhe) await kvSet(`falhas:ultima:${tipo}`, { em: Date.now(), detalhe: detalhe.slice(0, 200) }, 7 * 86_400);
  } catch {
    // ignora
  }
}

/** Soma das falhas de cada tipo nos dias pedidos (AAAA-MM-DD). */
export async function falhasNosDias(dias: string[]): Promise<Record<TipoFalha, number>> {
  const tipos = Object.keys(TIPOS_FALHA) as TipoFalha[];
  const r = Object.fromEntries(tipos.map((t) => [t, 0])) as Record<TipoFalha, number>;
  try {
    const chaves = dias.flatMap((d) => tipos.map((t) => chaveFalha(d, t)));
    const valores = await kvMGet<number>(chaves);
    chaves.forEach((_, i) => (r[tipos[i % tipos.length]] += Number(valores[i]) || 0));
  } catch {
    // sem dados
  }
  return r;
}

export async function ultimaFalha(tipo: TipoFalha): Promise<{ em: number; detalhe: string } | null> {
  return kvGet<{ em: number; detalhe: string }>(`falhas:ultima:${tipo}`).catch(() => null);
}
