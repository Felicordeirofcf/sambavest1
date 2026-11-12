'use client';

import { useEffect, useState } from 'react';

function partes(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { dias: Math.floor(s / 86400), horas: Math.floor((s % 86400) / 3600), min: Math.floor((s % 3600) / 60), seg: s % 60 };
}

/** Contagem regressiva até `alvo` (ISO). Renderiza zerado no servidor para não dar diferença na hidratação. */
export default function Contagem({ alvo, rotulo }: { alvo: string; rotulo: string }) {
  const [resta, setResta] = useState<number | null>(null);
  useEffect(() => {
    const fim = new Date(alvo).getTime();
    const tick = () => setResta(fim - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [alvo]);

  const p = partes(resta ?? 0);
  const caixas: [number, string][] = [
    [p.dias, 'dias'],
    [p.horas, 'horas'],
    [p.min, 'min'],
    [p.seg, 'seg'],
  ];
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/60 font-bold">{rotulo}</p>
      <div className="flex gap-2 sm:gap-3" role="timer" aria-live="off">
        {caixas.map(([n, r]) => (
          <div key={r} className="w-16 sm:w-20 rounded-xl border border-white/15 bg-white/5 py-2 text-center backdrop-blur">
            <span className="block text-3xl sm:text-4xl font-black tabular-nums text-white">{resta === null ? '--' : String(n).padStart(2, '0')}</span>
            <span className="text-[10px] uppercase tracking-widest text-white/50">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
