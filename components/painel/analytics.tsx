// Peças visuais da visão geral "ao vivo" (SVG e HTML puros, sem bibliotecas).
// Uma série por gráfico (dispensa legenda), cor única em tons de azul-noite; o duelo usa
// azul × vermelho (validado para daltonismo) e sempre com o nome escrito ao lado.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Coluna } from '../../lib/painel/analytics';
import { brl, pct } from './ui';

const TINTA = '#10173a';

// ---------- Card com minigráfico ----------

export function Sparkline({ valores, rotulo }: { valores: number[]; rotulo: string }) {
  const L = 120;
  const A = 34;
  const max = Math.max(...valores, 1);
  const passo = valores.length > 1 ? L / (valores.length - 1) : L;
  const pontos = valores.map((v, i) => [i * passo, A - 3 - (v / max) * (A - 8)] as const);
  const linha = pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [ux, uy] = pontos[pontos.length - 1] || [0, A];
  return (
    <svg viewBox={`-4 0 ${L + 8} ${A}`} className="h-9 w-full" role="img" aria-label={rotulo} preserveAspectRatio="none">
      <path d={`${linha} L${L},${A} L0,${A} Z`} fill={TINTA} opacity={0.07} />
      <path d={linha} fill="none" stroke={TINTA} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ux} cy={uy} r={3.2} fill="#f5b700" stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

export function CardAoVivo({
  rotulo,
  valor,
  delta,
  serie,
  href,
  ajuda,
}: {
  rotulo: string;
  valor: string;
  delta: number | null;
  serie: number[];
  href: string;
  ajuda?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-[var(--sv-ouro)] hover:shadow-lg md:p-5"
    >
      <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {rotulo}
        <span aria-hidden className="text-slate-300 transition group-hover:text-[var(--sv-ouro-escuro)]">
          →
        </span>
      </span>
      <span className="sv-display mt-1.5 text-[1.5rem] font-bold leading-none tabular-nums text-slate-900 md:text-3xl">{valor}</span>
      <span className="mt-2 min-h-5 text-xs">
        {delta === null ? (
          <span className="text-slate-500">{ajuda || 'sem base de comparação ontem'}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className={`rounded-md px-1.5 py-0.5 font-semibold ${delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {delta >= 0 ? '▲' : '▼'} {pct(Math.abs(delta))}
            </span>
            <span className="text-slate-500">vs ontem até agora</span>
          </span>
        )}
      </span>
      <span className="mt-3">
        <Sparkline valores={serie} rotulo={`${rotulo} nos últimos ${serie.length} dias`} />
      </span>
    </Link>
  );
}

// ---------- Medidor ----------

export function Medidor({ feito, total, rotulo }: { feito: number; total: number; rotulo: string }) {
  const p = total > 0 ? Math.min(1, feito / total) : 0;
  return (
    <div>
      <div
        className="h-4 w-full overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={feito}
      >
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#10173a,#2a3f8f)] transition-all duration-700" style={{ width: `${Math.max(p > 0 ? 2 : 0, p * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {pct(p)} · {feito} de {total}
      </p>
    </div>
  );
}

// ---------- Colunas com dica ao passar o mouse ----------

export function Colunas({ colunas, rotulo }: { colunas: Coluna[]; rotulo: string }) {
  const L = 760;
  const A = 210;
  const esq = 56;
  const baixo = 24;
  const topo = 26; // espaço para a dica
  const bruto = Math.max(1, ...colunas.map((c) => c.valor));
  const passoEscala = 10 ** Math.floor(Math.log10(bruto));
  const max = Math.ceil(bruto / (passoEscala / 2)) * (passoEscala / 2);
  const util = A - baixo - topo;
  const esc = (v: number) => (v / max) * util;
  const larg = (L - esq) / Math.max(1, colunas.length);
  const barra = Math.max(2, Math.min(36, larg - 2));
  const passoRot = Math.ceil(colunas.length / 10);
  const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(m)));
  if (colunas.every((c) => c.valor === 0)) return <p className="py-10 text-center text-sm text-slate-400">Sem vendas pagas neste período ainda.</p>;
  return (
    <figure>
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={rotulo}>
        {[0, 0.5, 1].map((f) => {
          const y = A - baixo - esc(f * max);
          return (
            <g key={f}>
              <line x1={esq} x2={L} y1={y} y2={y} stroke="#e1e4f0" />
              <text x={esq - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#69708f">
                {fmt(f * max)}
              </text>
            </g>
          );
        })}
        {colunas.map((c, i) => {
          const h = esc(c.valor);
          const cx = esq + i * larg + larg / 2;
          const x = cx - barra / 2;
          const y = A - baixo - h;
          const r = Math.min(4, barra / 2, h);
          const dicaX = Math.min(Math.max(cx, esq + 70), L - 70);
          return (
            <g key={c.chave} className="group">
              <rect x={esq + i * larg} y={0} width={larg} height={A - baixo} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barra - r} Q${x + barra},${y} ${x + barra},${y + r} V${y + h} Z`}
                  className="pointer-events-none fill-[#10173a] transition-colors group-hover:fill-[#f5b700]"
                />
              )}
              {i % passoRot === 0 && (
                <text x={cx} y={A - 7} textAnchor="middle" fontSize={10} fill="#69708f">
                  {c.rotulo}
                </text>
              )}
              <g className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100">
                <rect x={dicaX - 70} y={2} width={140} height={20} rx={6} fill="#10173a" />
                <text x={dicaX} y={16} textAnchor="middle" fontSize={10.5} fill="#fff">
                  {c.detalhe.length > 28 ? c.detalhe.slice(0, 27) + '…' : c.detalhe}
                </text>
              </g>
              <title>{c.detalhe}</title>
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-md">
          <tbody>
            {colunas.map((c) => (
              <tr key={c.chave} className="border-b border-slate-100">
                <td className="py-1">{c.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// ---------- Mapa do Brasil em blocos (um bloco por estado) ----------

// [coluna, linha] aproximando a posição de cada estado
const GRADE: Record<string, [number, number]> = {
  RR: [2, 0], AP: [4, 0],
  AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2],
  MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], AL: [6, 3],
  SP: [3, 4], MG: [4, 4], ES: [5, 4], SE: [6, 4],
  PR: [3, 5], RJ: [4, 5],
  SC: [3, 6],
  RS: [3, 7],
};
// Sequencial de uma cor (claro → escuro)
const RAMPA = ['#e8ebf6', '#c4cdee', '#8fa0dd', '#5470c4', '#2a3f8f', '#10173a'];

export function MapaBrasil({ dados }: { dados: Map<string, { qtd: number; valor: number }> }) {
  const max = Math.max(1, ...[...dados.values()].map((d) => d.qtd));
  const lado = 44;
  const gap = 4;
  const ranking = [...dados.entries()].filter(([uf]) => uf !== '—').sort((a, b) => b[1].qtd - a[1].qtd);
  return (
    <div className="flex flex-wrap items-start gap-5">
      <svg viewBox={`0 0 ${7 * (lado + gap)} ${8 * (lado + gap)}`} className="w-full max-w-[290px]" role="img" aria-label="Vendas por estado">
        {Object.entries(GRADE).map(([uf, [c, l]]) => {
          const d = dados.get(uf);
          const nivel = d ? Math.min(RAMPA.length - 1, 1 + Math.floor((d.qtd / max) * (RAMPA.length - 2))) : 0;
          const escuro = nivel >= 3;
          return (
            <g key={uf} className="group">
              <rect
                x={c * (lado + gap)}
                y={l * (lado + gap)}
                width={lado}
                height={lado}
                rx={8}
                fill={RAMPA[nivel]}
                className="transition group-hover:stroke-[#f5b700] group-hover:[stroke-width:3]"
              />
              <text x={c * (lado + gap) + lado / 2} y={l * (lado + gap) + lado / 2 + 1} textAnchor="middle" fontSize={12} fontWeight={700} fill={escuro ? '#fff' : '#353b5c'}>
                {uf}
              </text>
              {d && (
                <text x={c * (lado + gap) + lado / 2} y={l * (lado + gap) + lado / 2 + 14} textAnchor="middle" fontSize={9.5} fill={escuro ? '#fff' : '#353b5c'}>
                  {d.qtd}
                </text>
              )}
              <title>{d ? `${uf}: ${d.qtd} pedido(s) · ${brl(d.valor)}` : `${uf}: sem vendas`}</title>
            </g>
          );
        })}
      </svg>
      <div className="min-w-[160px] flex-1">
        {ranking.length === 0 ? (
          <p className="text-sm text-slate-400">Sem vendas no período.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {ranking.slice(0, 6).map(([uf, d], i) => (
              <li key={uf} className="flex justify-between gap-3">
                <span>
                  <span className="mr-2 text-slate-400">{i + 1}.</span>
                  <b>{uf}</b>
                </span>
                <span className="tabular-nums text-slate-600">
                  {d.qtd} · {brl(d.valor)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 flex items-center gap-1 text-[10px] text-slate-500" aria-hidden>
          menos
          {RAMPA.map((c) => (
            <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />
          ))}
          mais
        </div>
      </div>
    </div>
  );
}

// ---------- Funil ----------

export function Funil({ etapas }: { etapas: { nome: string; valor: number }[] }) {
  // A maior etapa vale 100% (no começo, o site pode registrar mais visitas que os cliques da Meta)
  const topo = Math.max(1, ...etapas.map((e) => e.valor));
  return (
    <ol className="space-y-2.5">
      {etapas.map((e, i) => {
        const anterior = i > 0 ? etapas[i - 1].valor : null;
        const passou = anterior ? e.valor / anterior : null;
        return (
          <li key={e.nome}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-700">{e.nome}</span>
              <span className="tabular-nums text-slate-900">
                <b>{e.valor.toLocaleString('pt-BR')}</b>
                {passou !== null && (
                  <span className={`ml-2 text-xs ${passou < 0.3 ? 'text-red-700' : 'text-slate-500'}`} title="quantos seguiram da etapa anterior">
                    {pct(Math.min(1, passou))}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-3 rounded-full bg-[#10173a]" style={{ width: `${Math.min(100, Math.max(e.valor > 0 ? 2 : 0, (e.valor / topo) * 100))}%`, opacity: 1 - i * 0.12 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Placar do duelo ----------

export function PlacarDuelo({
  beija,
  viradouro,
}: {
  beija: { votos: number; pecas: number; faturamento: number };
  viradouro: { votos: number; pecas: number; faturamento: number };
}) {
  const linha = (rotulo: string, a: number, b: number, fmt: (v: number) => string) => {
    const total = a + b;
    const pa = total ? a / total : 0.5;
    return (
      <div>
        <div className="mb-1 flex justify-between text-xs font-semibold">
          <span className="text-[#1d4ed8]">
            {fmt(a)} <span className="font-normal text-slate-500">Beija-Flor</span>
          </span>
          <span className="text-slate-500">{rotulo}</span>
          <span className="text-[#dc2626]">
            <span className="font-normal text-slate-500">Viradouro</span> {fmt(b)}
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" title={`${rotulo}: Beija-Flor ${fmt(a)} × Viradouro ${fmt(b)}`}>
          <div className="bg-[#1d4ed8]" style={{ width: `${pa * 100}%` }} />
          <div className="w-[2px] bg-white" />
          <div className="flex-1 bg-[#dc2626]" />
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      {linha('votos', beija.votos, viradouro.votos, (v) => String(v))}
      {linha('peças vendidas', beija.pecas, viradouro.pecas, (v) => String(v))}
      {linha('faturamento', beija.faturamento, viradouro.faturamento, (v) => brl(v))}
    </div>
  );
}

// ---------- Monitoramento ----------

export type EstadoServico = 'ok' | 'atencao' | 'erro' | 'off';

const ESTILO: Record<EstadoServico, { cor: string; icone: string; rotulo: string }> = {
  ok: { cor: 'bg-emerald-50 text-emerald-800', icone: '●', rotulo: 'ok' },
  atencao: { cor: 'bg-amber-50 text-amber-900', icone: '▲', rotulo: 'atenção' },
  erro: { cor: 'bg-red-50 text-red-800', icone: '✕', rotulo: 'erro' },
  off: { cor: 'bg-slate-100 text-slate-600', icone: '○', rotulo: 'desligado' },
};

export function LinhaServico({ nome, estado, detalhe }: { nome: string; estado: EstadoServico; detalhe: ReactNode }) {
  const e = ESTILO[estado];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-0.5 inline-flex w-[88px] shrink-0 items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${e.cor}`}>
        <span aria-hidden>{e.icone}</span>
        {e.rotulo}
      </span>
      <span className="text-sm">
        <b>{nome}</b>
        <span className="block text-slate-500">{detalhe}</span>
      </span>
    </li>
  );
}
