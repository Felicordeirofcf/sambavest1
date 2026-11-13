// Períodos da tela inicial do painel (Hoje, Ontem, Essa semana...) e a comparação com o período anterior.
import { PERIODO_BF } from '../blackfridayPeriodo';
import { quando } from './analytics';
import type { PedidoResumo } from './dados';
import { diaLocal, pago } from './metricas';

const DIA = 86_400_000;

export const PERIODOS_PAINEL = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  semana: 'Essa semana',
  mes: 'Mês atual',
  black: 'Black Friday',
  '30d': 'Últimos 30 dias',
} as const;
export type ChavePeriodoPainel = keyof typeof PERIODOS_PAINEL;

export type Intervalo = {
  chave: ChavePeriodoPainel;
  inicio: number;
  fim: number; // exclusivo
  antInicio: number;
  antFim: number;
  /** Como o período anterior aparece nos cards ("vs ontem", "vs semana passada até agora"...). */
  comparacao: string;
};

/** Meia-noite (São Paulo, UTC−3) do dia de `ms`. */
const meiaNoite = (ms: number) => Date.parse(`${diaLocal(ms)}T00:00:00-03:00`);

export function intervaloDoPeriodo(chave: ChavePeriodoPainel, agora: number): Intervalo {
  const hoje0 = meiaNoite(agora);
  const decorrido = agora - hoje0;
  switch (chave) {
    case 'hoje':
      return { chave, inicio: hoje0, fim: agora, antInicio: hoje0 - DIA, antFim: hoje0 - DIA + decorrido, comparacao: 'vs ontem até esta hora' };
    case 'ontem':
      return { chave, inicio: hoje0 - DIA, fim: hoje0, antInicio: hoje0 - 2 * DIA, antFim: hoje0 - DIA, comparacao: 'vs anteontem' };
    case 'semana': {
      // Semana começa na segunda-feira
      const diaSemana = (new Date(hoje0 + 3 * 3_600_000).getUTCDay() + 6) % 7;
      const inicio = hoje0 - diaSemana * DIA;
      return { chave, inicio, fim: agora, antInicio: inicio - 7 * DIA, antFim: agora - 7 * DIA, comparacao: 'vs semana passada até agora' };
    }
    case 'mes': {
      const [a, m] = diaLocal(agora).split('-').map(Number);
      const inicio = Date.parse(`${a}-${String(m).padStart(2, '0')}-01T00:00:00-03:00`);
      const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1];
      const antInicio = Date.parse(`${pa}-${String(pm).padStart(2, '0')}-01T00:00:00-03:00`);
      return { chave, inicio, fim: agora, antInicio, antFim: Math.min(antInicio + (agora - inicio), inicio), comparacao: 'vs mês passado até o mesmo dia' };
    }
    case 'black': {
      const inicio = PERIODO_BF.inicio.getTime();
      const fim = Math.min(agora, PERIODO_BF.fim.getTime());
      const dur = Math.max(0, fim - inicio);
      return { chave, inicio, fim, antInicio: inicio - dur, antFim: inicio, comparacao: 'vs mesmo nº de dias antes da Black' };
    }
    default:
      return { chave: '30d', inicio: agora - 30 * DIA, fim: agora, antInicio: agora - 60 * DIA, antFim: agora - 30 * DIA, comparacao: 'vs 30 dias anteriores' };
  }
}

/** Dias (AAAA-MM-DD) cobertos pelo intervalo, para somar o funil. */
export function diasDoIntervalo(inicio: number, fim: number): string[] {
  const dias: string[] = [];
  for (let t = meiaNoite(inicio); t < fim; t += DIA) dias.push(diaLocal(t + 3_600_000));
  return Array.from(new Set(dias));
}

export type Kpis = { faturamento: number; pedidos: number; ticket: number; pecasPorPedido: number; pecas: number };

export function kpisDoIntervalo(pedidos: PedidoResumo[], inicio: number, fim: number): Kpis {
  const pagos = pedidos.filter((p) => pago(p) && quando(p) >= inicio && quando(p) < fim);
  const faturamento = pagos.reduce((s, p) => s + p.total, 0);
  const pecas = pagos.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.qtd, 0), 0);
  return {
    faturamento,
    pedidos: pagos.length,
    ticket: pagos.length ? faturamento / pagos.length : 0,
    pecasPorPedido: pagos.length ? pecas / pagos.length : 0,
    pecas,
  };
}

/** Pedidos pagos dentro do intervalo (para rankings, mapa e funil). */
export const pagosNoIntervalo = (pedidos: PedidoResumo[], inicio: number, fim: number) =>
  pedidos.filter((p) => pago(p) && quando(p) >= inicio && quando(p) < fim);
