'use client';

// Pagamentos dos últimos dias em abas pequenas: Pix pago / Pix não pago / Cartão pago / Cartão não pago / Cancelados.
import Link from 'next/link';
import { useState } from 'react';

export type GrupoPagamento = 'pix-pago' | 'pix-aberto' | 'cartao-pago' | 'cartao-aberto' | 'cancelado';

export type LinhaPagamento = {
  id: number;
  grupo: GrupoPagamento;
  cliente: string;
  total: string;
  quando: string;
  detalhe?: string;
  whatsapp?: string; // link wa.me já com a mensagem
};

const ABAS: { id: GrupoPagamento; rotulo: string; cor: string }[] = [
  { id: 'pix-aberto', rotulo: 'Pix não pago', cor: 'bg-amber-100 text-amber-900' },
  { id: 'pix-pago', rotulo: 'Pix pago', cor: 'bg-emerald-100 text-emerald-900' },
  { id: 'cartao-aberto', rotulo: 'Cartão não pago', cor: 'bg-amber-100 text-amber-900' },
  { id: 'cartao-pago', rotulo: 'Cartão pago', cor: 'bg-emerald-100 text-emerald-900' },
  { id: 'cancelado', rotulo: 'Cancelados', cor: 'bg-slate-200 text-slate-700' },
];

export default function PagamentosAbas({ linhas }: { linhas: LinhaPagamento[] }) {
  const conta = (g: GrupoPagamento) => linhas.filter((l) => l.grupo === g).length;
  // Abre na primeira aba que tem algo a fazer (não pagos), senão na primeira com pedidos
  const inicial = (['pix-aberto', 'cartao-aberto', 'pix-pago', 'cartao-pago', 'cancelado'] as GrupoPagamento[]).find((g) => conta(g) > 0) || 'pix-aberto';
  const [aba, setAba] = useState<GrupoPagamento>(inicial);
  const lista = linhas.filter((l) => l.grupo === aba);

  return (
    <div>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1.5">
        {ABAS.map((a) => {
          const ativo = a.id === aba;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setAba(a.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                ativo ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {a.rotulo}
              <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold ${ativo ? 'bg-white/20 text-white' : a.cor}`}>{conta(a.id)}</span>
            </button>
          );
        })}
      </div>

      {lista.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">Nenhum pedido nesta aba.</p>
      ) : (
        <ul role="tabpanel" className="divide-y divide-slate-100 text-sm">
          {lista.slice(0, 15).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <Link href={`/painel/pedidos/${l.id}`} className="font-semibold text-sky-800 underline">
                  #{l.id}
                </Link>{' '}
                {l.cliente} · <b>{l.total}</b>
                <span className="block text-xs text-slate-500">
                  {l.quando}
                  {l.detalhe ? ` · ${l.detalhe}` : ''}
                </span>
              </span>
              {l.whatsapp ? (
                <a href={l.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-bold text-black">
                  Chamar no WhatsApp
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
