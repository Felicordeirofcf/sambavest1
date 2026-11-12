// Funil da loja: contadores anônimos por dia (sem cookie de rastreio, sem dados pessoais).
// Cada navegador conta no máximo uma vez por etapa por dia (controle no próprio navegador).
import { kvGet, kvIncr } from '../automacao/kv';

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

/** Soma de cada etapa nos dias pedidos (AAAA-MM-DD). */
export async function somaFunil(dias: string[]): Promise<Record<EtapaFunil, number>> {
  const r = { visita: 0, produto: 0, sacola: 0, checkout: 0 } as Record<EtapaFunil, number>;
  await Promise.all(
    dias.flatMap((d) =>
      ETAPAS_FUNIL.map(async (e) => {
        r[e] += Number(await kvGet<number>(chave(d, e)).catch(() => 0)) || 0;
      })
    )
  );
  return r;
}
