'use client';

// Quadro kanban do CRM: arrastar um cartão para outra coluna muda a etapa do contato.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moverEtapaCrm } from '../../app/painel/actions';

export type CartaoQuadro = {
  chave: string;
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
      <div className="flex gap-3 overflow-x-auto pb-3">
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
              className={`flex-1 min-w-[13rem] rounded-xl border p-2 transition-colors ${sobre === col.id ? 'bg-amber-50 border-amber-300' : 'bg-slate-100/70 border-slate-200'}`}
            >
              <h2 className="flex justify-between items-center px-1 pb-2 text-sm font-semibold text-slate-700">
                {col.nome}
                <span className="text-xs font-normal text-slate-500 bg-white rounded-full px-2">{doCol.length}</span>
              </h2>
              <div className="space-y-2 min-h-24">
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
                    className={`bg-white rounded-lg border p-3 shadow-sm cursor-grab active:cursor-grabbing ${
                      arrastando === c.chave ? 'opacity-50' : ''
                    } ${c.naoLidas > 0 ? 'border-emerald-400' : 'border-slate-200'}`}
                  >
                    <div className="flex justify-between gap-2">
                      <Link href={`/painel/crm/${c.chave}`} className="font-medium text-sm truncate hover:underline">
                        {c.nome}
                      </Link>
                      <span className="text-[11px] text-slate-500 shrink-0">{haQuanto(c.ultimaAtividade, agora)}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 break-words">
                      {c.ultimaDe === 'cliente' ? '' : c.ultimaDe === 'aviso' ? 'Aviso: ' : 'Você: '}
                      {c.ultimaMensagem || '—'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2 text-[11px]">
                      {c.naoLidas > 0 && <span className="bg-emerald-600 text-white px-1.5 rounded-full">{c.naoLidas} nova(s)</span>}
                      {c.ultimaDe === 'cliente' && <span className="bg-amber-100 text-amber-900 px-1.5 rounded">aguardando você</span>}
                      {!c.janelaAberta && <span className="bg-slate-100 text-slate-500 px-1.5 rounded" title="Passou de 24h desde a última mensagem do cliente: só modelo aprovado">janela fechada</span>}
                      {c.pagos > 0 ? (
                        <span className="text-emerald-800">✓ {c.pagos} compra(s) · {brl(c.gasto)}</span>
                      ) : (
                        <span className="text-slate-400">sem compra</span>
                      )}
                      {c.pendentes > 0 && <span className="text-orange-800">● pedido não pago</span>}
                      {c.etiquetas.slice(0, 3).map((t) => (
                        <span key={t} className="bg-slate-100 text-slate-600 px-1 rounded">
                          #{t}
                        </span>
                      ))}
                    </div>
                    {/* Sem arrastar (celular): escolher a etapa */}
                    <select
                      aria-label="Mover para a etapa"
                      value={c.etapa}
                      onChange={(e) => mover(c.chave, e.target.value)}
                      className="mt-2 w-full text-xs border border-slate-200 rounded px-1 py-1 text-slate-600 md:hidden"
                    >
                      {colunas.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
                {doCol.length === 0 && <p className="text-xs text-slate-400 px-1 py-6 text-center">Arraste um cartão para cá</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
