// Peças visuais do painel (sem dependências externas).
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PedidoResumo } from '../../lib/painel/dados';
import { STATUS_NOME } from '../../lib/painel/dados';
import type { Fatia, PontoDia } from '../../lib/painel/metricas';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
export const dataHora = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const dataCurta = (ms: number) =>
  new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' });

export function Cartao({ titulo, children, acao, className = '' }: { titulo?: string; children: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 p-5 md:p-6 ${className}`}>
      {(titulo || acao) && (
        <div className="flex items-center justify-between mb-4 gap-2">
          {titulo && <h2 className="sv-display text-base font-bold text-slate-900">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ rotulo, valor, delta, ajuda }: { rotulo: string; valor: string; delta?: number | null; ajuda?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</p>
      <p className="sv-display text-[1.35rem] sm:text-[1.7rem] md:text-3xl font-bold text-slate-900 mt-1.5 tabular-nums leading-none break-words">{valor}</p>
      <p className="text-xs mt-2.5 min-h-5">
        {delta !== undefined && delta !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded-md font-semibold ${delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {delta >= 0 ? '▲' : '▼'} {pct(Math.abs(delta))}
            </span>
            <span className="text-slate-500">vs período anterior</span>
          </span>
        ) : (
          <span className="text-slate-500">{ajuda || ''}</span>
        )}
      </p>
    </div>
  );
}

const COR_STATUS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  'on-hold': 'bg-amber-50 text-amber-800 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  refunded: 'bg-slate-100 text-slate-600 ring-slate-200',
  failed: 'bg-red-50 text-red-800 ring-red-200',
};

export function StatusPedido({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ring-1 whitespace-nowrap ${COR_STATUS[status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
      {STATUS_NOME[status] || status}
    </span>
  );
}

export function Chip({ ok, children, titulo }: { ok: boolean | 'erro'; children: ReactNode; titulo?: string }) {
  const cor = ok === 'erro' ? 'bg-red-50 text-red-700 ring-red-200' : ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-50 text-slate-400 ring-slate-200';
  const icone = ok === 'erro' ? '!' : ok ? '✓' : '·';
  return (
    <span title={titulo} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ring-1 whitespace-nowrap ${cor}`}>
      <span aria-hidden>{icone}</span>
      {children}
    </span>
  );
}

/** Situação das automações de um pedido, em chips. */
export function MarcasPedido({ p }: { p: PedidoResumo }) {
  const pagoOuConcluido = p.status === 'processing' || p.status === 'completed';
  if (!pagoOuConcluido) return p.marcas.erro ? <Chip ok="erro" titulo={p.marcas.erro}>erro</Chip> : null;
  return (
    <span className="flex flex-wrap gap-1">
      <Chip ok={Boolean(p.marcas.bling)} titulo="Pedido de venda no Bling">Bling</Chip>
      <Chip ok={Boolean(p.marcas.nfe)} titulo="NF-e">NF-e</Chip>
      <Chip ok={Boolean(p.marcas.envio || p.marcas.rastreio)} titulo="Envio no Melhor Envio">Envio</Chip>
      <Chip ok={Boolean(p.marcas.rastreio)} titulo={p.marcas.rastreio ? `Rastreio ${p.marcas.rastreio}` : 'Sem rastreio'}>Rastreio</Chip>
      {p.marcas.erro && <Chip ok="erro" titulo={p.marcas.erro}>erro</Chip>}
    </span>
  );
}

/** Colunas de faturamento por dia (uma série: dispensa legenda). Passe o mouse para ver o valor. */
export function GraficoDias({ pontos }: { pontos: PontoDia[] }) {
  const L = 720;
  const A = 180;
  const margemEsq = 56;
  const margemBaixo = 22;
  const bruto = Math.max(1, ...pontos.map((p) => p.faturamento));
  // topo da escala "redondo" (ex.: 1.548 → 2.000) para as marcas do eixo serem números limpos
  const passo = 10 ** Math.floor(Math.log10(bruto));
  const max = Math.ceil(bruto / (passo / 2)) * (passo / 2);
  const escala = (v: number) => (v / max) * (A - margemBaixo - 8);
  const largura = (L - margemEsq) / Math.max(1, pontos.length);
  const barra = Math.max(2, largura - 2); // 2px de respiro entre colunas
  const marcas = [0, 0.5, 1].map((f) => f * max);
  const passoRotulo = Math.ceil(pontos.length / 8);
  return (
    <figure>
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full h-auto" role="img" aria-label="Faturamento por dia">
        {marcas.map((m) => {
          const y = A - margemBaixo - escala(m);
          return (
            <g key={m}>
              <line x1={margemEsq} x2={L} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={margemEsq - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#64748b">
                {m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : Math.round(m)}
              </text>
            </g>
          );
        })}
        {pontos.map((p, i) => {
          const h = escala(p.faturamento);
          const x = margemEsq + i * largura + 1;
          const y = A - margemBaixo - h;
          const [, mes, dia] = p.dia.split('-');
          return (
            <g key={p.dia} className="group">
              {/* área de toque maior que a coluna */}
              <rect x={x - 1} y={0} width={largura} height={A - margemBaixo} fill="transparent">
                <title>{`${dia}/${mes}: ${brl(p.faturamento)} · ${p.pedidos} pedido(s)`}</title>
              </rect>
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, barra / 2)},${y} H${x + barra - Math.min(4, barra / 2)} Q${x + barra},${y} ${x + barra},${y + Math.min(4, h)} V${y + h} Z`}
                  className="fill-[#0B1B34] group-hover:fill-[#C9A227] pointer-events-none"
                />
              )}
              {i % passoRotulo === 0 && (
                <text x={x + barra / 2} y={A - 6} textAnchor="middle" fontSize={10} fill="#64748b">
                  {`${dia}/${mes}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-sm">
          <tbody>
            {pontos.map((p) => (
              <tr key={p.dia} className="border-b border-slate-100">
                <td className="py-1">{p.dia.split('-').reverse().join('/')}</td>
                <td className="text-right tabular-nums">{p.pedidos}</td>
                <td className="text-right tabular-nums">{brl(p.faturamento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Barras horizontais com rótulo e valor em texto (o comprimento só reforça o número). */
export function Barras({ fatias, formato = 'valor' }: { fatias: Fatia[]; formato?: 'valor' | 'qtd' }) {
  if (fatias.length === 0) return <p className="text-sm text-slate-400">Sem vendas no período.</p>;
  const max = Math.max(...fatias.map((f) => (formato === 'valor' ? f.valor : f.qtd)), 1);
  return (
    <ul className="space-y-2.5">
      {fatias.map((f) => {
        const v = formato === 'valor' ? f.valor : f.qtd;
        return (
          <li key={f.nome} title={`${f.nome}: ${brl(f.valor)} · ${f.qtd} ${formato === 'qtd' ? 'peça(s)' : 'pedido(s)'}`}>
            <div className="flex justify-between text-sm gap-3">
              <span className="truncate text-slate-700">{f.nome}</span>
              <span className="tabular-nums text-slate-900 shrink-0">
                {formato === 'valor' ? brl(f.valor) : `${f.qtd} pç · ${brl(f.valor)}`}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full mt-1">
              <div className="h-1.5 rounded-full bg-[#0B1B34]" style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SeletorPeriodo({ atual, base, extra = '' }: { atual: number; base: string; extra?: string }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
      {[7, 30, 90].map((d) => (
        <Link
          key={d}
          href={`${base}?dias=${d}${extra}`}
          className={`px-3 py-1 rounded-md ${atual === d ? 'bg-[#0B1B34] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          {d} dias
        </Link>
      ))}
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'erro' | 'ok'; children: ReactNode }) {
  const cor = tipo === 'erro' ? 'bg-red-50 text-red-800 border-red-200' : tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-900 border-amber-200';
  return <div className={`border rounded-lg px-4 py-3 text-sm ${cor}`}>{children}</div>;
}

const COR_SEGMENTO: Record<string, string> = {
  VIP: 'bg-amber-50 text-amber-900 ring-amber-200',
  Recorrente: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Novo: 'bg-sky-50 text-sky-800 ring-sky-200',
  Inativo: 'bg-slate-100 text-slate-600 ring-slate-200',
  'Não comprou': 'bg-red-50 text-red-700 ring-red-200',
};

export function SeloSegmento({ s }: { s: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs ring-1 whitespace-nowrap ${COR_SEGMENTO[s] || ''}`}>{s}</span>;
}
