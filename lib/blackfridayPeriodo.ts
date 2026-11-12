// Período da Black Friday (horário de Brasília). Arquivo leve: usado também pelo proxy.ts.
export const PERIODO_BF = {
  inicio: new Date('2026-11-11T00:00:00-03:00'),
  fim: new Date('2026-11-30T23:59:59-03:00'),
};

export type FaseBF = 'antes' | 'durante' | 'depois';

export function faseBF(agora = Date.now()): FaseBF {
  if (agora < PERIODO_BF.inicio.getTime()) return 'antes';
  if (agora <= PERIODO_BF.fim.getTime()) return 'durante';
  return 'depois';
}

/** Dias de calendário até o fim (0 = hoje é o último dia), no horário de Brasília. */
export function diasAteFimBF(agora = Date.now()): number {
  const dia = (ms: number) => new Date(new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((dia(PERIODO_BF.fim.getTime()) - dia(agora)) / 86_400_000));
}
