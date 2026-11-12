// Funil da loja: contadores anônimos por dia (sem cookie de rastreio, sem dados pessoais).
// Cada navegador conta no máximo uma vez por etapa por dia (controle no próprio navegador).
import { kvIncr, kvMGet } from '../automacao/kv';

export const ETAPAS_FUNIL = ['visita', 'produto', 'sacola', 'checkout'] as const;
export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

export const NOME_ETAPA: Record<EtapaFunil | 'pago', string> = {
  visita: 'Visitou a loja',
  produto: 'Abriu uma camisa',
  sacola: 'Colocou na sacola',
  checkout: 'Chegou no checkout',
  pago: 'Pagou',
};

const chave = (dia: string, etapa: EtapaFunil) => `funil:${dia}:${etapa}`;

export async function contarEtapa(dia: string, etapa: EtapaFunil): Promise<void> {
  await kvIncr(chave(dia, etapa));
}

/** Soma de cada etapa nos dias pedidos (AAAA-MM-DD), numa consulta só. */
export async function somaFunil(dias: string[]): Promise<Record<EtapaFunil, number>> {
  const r = { visita: 0, produto: 0, sacola: 0, checkout: 0 } as Record<EtapaFunil, number>;
  for (const d of await funilPorDia(dias)) for (const e of ETAPAS_FUNIL) r[e] += d[e];
  return r;
}

/** Etapas de cada dia, numa consulta só ao Upstash. */
export async function funilPorDia(dias: string[]): Promise<Record<EtapaFunil, number>[]> {
  const chaves = dias.flatMap((d) => ETAPAS_FUNIL.map((e) => chave(d, e)));
  const valores = await kvMGet<number>(chaves).catch(() => chaves.map(() => 0));
  return dias.map((_, i) => {
    const r = {} as Record<EtapaFunil, number>;
    ETAPAS_FUNIL.forEach((e, j) => (r[e] = Number(valores[i * ETAPAS_FUNIL.length + j]) || 0));
    return r;
  });
}
