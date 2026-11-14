'use client';

// Quadro kanban do CRM: arrastar um cartão para outra coluna muda a etapa do contato.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moverEtapaCrm } from '../../app/painel/actions';

export type CartaoQuadro = {
  chave: string;
  numero: string;
  nome: string;
  etapa: string;
  ultimaMensagem: string;
  ultimaDe: string;
  ultimaAtividade: number;
  naoLidas: number;
  janelaAberta: boolean;
  pagos: number;
  gasto: number;
  pendentes: number;
  etiquetas: string[];
};

type Coluna = { id: string; nome: string };

// Cor de cada etapa (faixa no topo da coluna)
const COR_COLUNA: Record<string, string> = {
  novo: '#0ea5e9',
  atendimento: '#f59e0b',
  pagamento: '#f97316',
  cliente: '#10b981',
  'pos-venda': '#8b5cf6',
  perdido: '#94a3b8',
};
const CORES_AVATAR = ['#059669', '#0284c7', '#7c3aed', '#b45309', '#e11d48', '#0f766e'];
const corAvatar = (n: string) => CORES_AVATAR[Number(n.slice(-2)) % CORES_AVATAR.length] || CORES_AVATAR[0];
const inicial = (nome: string) => nome.replace(/[^\p{L}\d]/gu, '').slice(0, 1).toUpperCase() || '#';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function haQuanto(ms: number, agora: number): string {
  const min = Math.max(0, Math.round((agora - ms) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export default function Quadro({ colunas, cartoes, agora }: { colunas: Coluna[]; cartoes: CartaoQuadro[]; agora: number }) {
  const router = useRouter();
  const [itens, setItens] = useState(cartoes);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [, startTransition] = useTransition();

  const mover = (chave: string, etapa: string) => {
    const anterior = itens.find((c) => c.chave === chave)?.etapa;
    if (!anterior || anterior === etapa) return;
    setItens((l) => l.map((c) => (c.chave === chave ? { ...c, etapa } : c)));
    startTransition(async () => {
      const r = await moverEtapaCrm(chave, etapa).catch(() => ({ ok: false }));
      if (!r.ok) {
        setItens((l) => l.map((c) => (c.chave === chave ? { ...c, etapa: anterior } : c)));
        setErro('Não consegui mover o contato. Tente de novo.');
      } else {
        setErro('');
        router.refresh();
      }
    });
  };

  return (
    <div>
      {erro && <p className="mb-3 text-sm text-red-700">{erro}</p>}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {colunas.map((col) => {
          const doCol = itens.filter((c) => c.etapa === col.id).sort((a, b) => b.ultimaAtividade - a.ultimaAtividade);
          return (
            <section
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.id);
              }}
              onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const chave = e.dataTransfer.getData('text/plain') || arrastando;
                setSobre(null);
                setArrastando(null);
                if (chave) mover(chave, col.id);
              }}
              className={`flex max-h-[calc(100dvh-16rem)] min-h-[16rem] w-[82vw] shrink-0 snap-start flex-col rounded-xl border transition-colors sm:w-[17.5rem] 2xl:w-auto 2xl:min-w-[16rem] 2xl:flex-1 ${
                sobre === col.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-100/70'
              }`}
            >
              <h2 className="flex items-center justify-between gap-2 rounded-t-xl border-t-4 px-3 py-2.5 text-sm font-semibold text-slate-800" style={{ borderTopColor: COR_COLUNA[col.id] || '#94a3b8' }}>
                <span className="truncate">{col.nome}</span>
                <span className="rounded-full bg-white px-2 text-xs font-normal text-slate-600">{doCol.length}</span>
              </h2>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {doCol.map((c) => (
                  <article
                    key={c.chave}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', c.chave);
                      e.dataTransfer.effectAllowed = 'move';
                      setArrastando(c.chave);
                    }}
                    onDragEnd={() => setArrastando(null)}
                    className={`group relative rounded-lg border bg-white shadow-sm transition hover:shadow-md ${arrastando === c.chave ? 'opacity-50' : ''} ${
                      c.naoLidas > 0 ? 'border-emerald-400' : 'border-slate-200'
                    }`}
                  >
                    <Link href={`/painel/atendimento?n=${c.numero}`} draggable={false} className="block p-3 pr-8" title="Abrir a conversa">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: corAvatar(c.numero) }}>
                          {inicial(c.nome)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-sm ${c.naoLidas ? 'font-bold' : 'font-medium'} text-slate-900`}>{c.nome}</span>
                            <span className={`shrink-0 text-[11px] ${c.naoLidas ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{haQuanto(c.ultimaAtividade, agora)}</span>
                          </span>
                          <span className="block truncate text-xs text-slate-600">
                            {c.ultimaDe === 'cliente' ? '' : c.ultimaDe === 'aviso' ? '🔔 ' : c.ultimaDe === 'robo' ? '🤖 ' : 'Você: '}
                            {c.ultimaMensagem || '—'}
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                        {c.naoLidas > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-white">{c.naoLidas} nova(s)</span>}
                        {c.ultimaDe === 'cliente' && <span className="rounded bg-amber-100 px-1.5 text-amber-900">aguardando resposta</span>}
                        {!c.janelaAberta && (
                          <span className="rounded bg-slate-100 px-1.5 text-slate-600" title="Passou de 24h desde a última mensagem do cliente: só modelo aprovado">
                            janela fechada
                          </span>
                        )}
                        {c.pagos > 0 ? (
                          <span className="rounded bg-emerald-50 px-1.5 text-emerald-800">✓ {c.pagos} compra(s) · {brl(c.gasto)}</span>
                        ) : null}
                        {c.pendentes > 0 && <span className="rounded bg-orange-50 px-1.5 text-orange-800">● pedido não pago</span>}
                        {c.etiquetas.slice(0, 3).map((t) => (
                          <span key={t} className="rounded bg-slate-100 px-1 text-slate-600">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </Link>
                    <Link
                      href={`/painel/crm/${c.chave}`}
                      draggable={false}
                      title="Ficha do contato (etapa, etiquetas, notas)"
                      className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <circle cx="12" cy="8" r="3.5" />
                        <path d="M5 20a7 7 0 0 1 14 0" />
                      </svg>
                    </Link>
                    {/* Sem arrastar (celular): escolher a etapa */}
                    <div className="px-3 pb-2 md:hidden">
                      <select
                        aria-label="Mover para a etapa"
                        value={c.etapa}
                        onChange={(e) => mover(c.chave, e.target.value)}
                        className="w-full rounded border border-slate-200 bg-white px-1 py-1 text-xs text-slate-700"
                      >
                        {colunas.map((x) => (
                          <option key={x.id} value={x.id}>
                            Mover para: {x.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
                {doCol.length === 0 && <p className="px-1 py-6 text-center text-xs text-slate-400">Arraste um cartão para cá</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
