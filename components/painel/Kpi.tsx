// Card de indicador da tela inicial: valor do período, ícone e a comparação com o período anterior.
import Link from 'next/link';
import type { ReactNode } from 'react';

const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const ICONES_KPI = {
  faturamento: ic(<path d="m3 17 6-6 4 4 8-8M15 7h6v6" />),
  pedidos: ic(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>),
  ticket: ic(<path d="M4 19V10m6 9V5m6 14v-7m4 7H3" />),
  pecas: ic(<><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>),
  conversao: ic(<><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /><path d="M19 5 5 19" /></>),
};

const COR = {
  faturamento: 'bg-emerald-50 text-emerald-700',
  pedidos: 'bg-slate-100 text-slate-700',
  ticket: 'bg-amber-50 text-amber-700',
  pecas: 'bg-slate-100 text-slate-700',
  conversao: 'bg-sky-50 text-sky-800',
};

export function Kpi({
  rotulo,
  valor,
  anterior,
  delta,
  icone,
  href,
  ajuda,
}: {
  rotulo: string;
  valor: string;
  /** Valor do período anterior, já formatado. */
  anterior: string | null;
  delta: number | null;
  icone: keyof typeof ICONES_KPI;
  href?: string;
  ajuda?: string;
}) {
  const sobe = delta !== null && delta > 0;
  const desce = delta !== null && delta < 0;
  const corpo = (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,21,48,0.04)] transition hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">{rotulo}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${COR[icone]}`}>{ICONES_KPI[icone]}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.7rem]">{valor}</p>
      <p className="mt-2 text-xs text-slate-500">
        {delta !== null && (
          <span className={`mr-1 font-semibold ${sobe ? 'text-emerald-600' : desce ? 'text-rose-600' : 'text-slate-500'}`}>
            {sobe ? '↗ +' : desce ? '↘ ' : ''}
            {(delta * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {anterior !== null ? `vs ${anterior} ant.` : ajuda || 'sem comparação'}
      </p>
      {ajuda && anterior !== null && <p className="mt-0.5 text-[11px] text-slate-400">{ajuda}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}
