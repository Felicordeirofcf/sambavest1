'use client';

import { useState, useSyncExternalStore } from 'react';

type Placar = { 'beija-flor': number; viradouro: number };
type Escola = keyof Placar;

const LADOS: { id: Escola; nome: string; cidade: string; cor: string; emoji: string }[] = [
  { id: 'beija-flor', nome: 'Beija-Flor', cidade: 'Nilópolis', cor: 'from-sky-500 to-blue-700', emoji: '💙' },
  { id: 'viradouro', nome: 'Viradouro', cidade: 'Niterói', cor: 'from-red-500 to-red-700', emoji: '❤️' },
];

const semInscricao = () => () => {};
function lerVotoCookie(): Escola | null {
  const m = document.cookie.match(/(?:^|; )sv_bf_voto=([^;]+)/);
  return m && (m[1] === 'beija-flor' || m[1] === 'viradouro') ? m[1] : null;
}

export default function Duelo({ inicial }: { inicial: Placar }) {
  const [placar, setPlacar] = useState<Placar>(inicial);
  const [votoAgora, setVoto] = useState<Escola | null>(null);
  // Voto anterior (cookie). No servidor é sempre null, então a hidratação bate.
  const votoCookie = useSyncExternalStore(semInscricao, lerVotoCookie, () => null);
  const voto = votoAgora ?? votoCookie;
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  const total = placar['beija-flor'] + placar.viradouro;
  const pct = (e: Escola) => (total ? Math.round((placar[e] / total) * 100) : 50);

  async function votar(e: Escola) {
    if (voto || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch('/api/black-friday/voto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escola: e }),
      });
      const j = await r.json();
      if (j.placar) setPlacar(j.placar);
      if (j.ok) setVoto(e);
      else if (j.jaVotou) setAviso('Seu voto já foi contado. Valeu! 🥁');
    } catch {
      setAviso('Não deu para votar agora. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {LADOS.map((l) => (
          <button
            key={l.id}
            type="button"
            data-bf="voto"
            onClick={() => votar(l.id)}
            disabled={Boolean(voto) || enviando}
            className={`rounded-2xl bg-gradient-to-br ${l.cor} p-4 sm:p-5 text-left text-white shadow-lg transition-transform enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:cursor-default ${
              voto && voto !== l.id ? 'opacity-50' : ''
            } ${voto === l.id ? 'ring-4 ring-[#C9A227]' : ''}`}
          >
            <span className="text-2xl">{l.emoji}</span>
            <span className="block text-lg sm:text-2xl font-black uppercase leading-tight">{l.nome}</span>
            <span className="block text-xs sm:text-sm text-white/80">{l.cidade}</span>
            <span className="mt-3 block text-xs font-bold uppercase tracking-widest">
              {voto === l.id ? 'Seu voto ✓' : voto ? '' : 'Votar'}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4" aria-label="Placar do duelo">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/10">
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-700" style={{ width: `${pct('beija-flor')}%` }} />
          <div className="bg-gradient-to-r from-red-600 to-red-500 transition-all duration-700" style={{ width: `${pct('viradouro')}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-sm font-bold">
          <span className="text-sky-300">{pct('beija-flor')}% Beija-Flor</span>
          <span className="text-white/50 text-xs">{total} {total === 1 ? 'voto' : 'votos'}</span>
          <span className="text-red-300">Viradouro {pct('viradouro')}%</span>
        </div>
        {aviso && <p className="mt-2 text-center text-sm text-white/70">{aviso}</p>}
      </div>
    </div>
  );
}
