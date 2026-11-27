'use client';

import { useEffect, useState } from 'react';

/** Contagem regressiva em uma linha ("3d 14h 22min 05s"). Mostra "--" no servidor para não dar diferença na hidratação. */
export default function ContagemCurta({ alvo, className = '' }: { alvo: string; className?: string }) {
  const [resta, setResta] = useState<number | null>(null);
  useEffect(() => {
    const fim = new Date(alvo).getTime();
    const tick = () => setResta(fim - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [alvo]);

  if (resta !== null && resta <= 0) return null;
  const s = Math.max(0, Math.floor((resta ?? 0) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const dd = (n: number) => String(n).padStart(2, '0');
  const texto = resta === null ? '--' : `${d > 0 ? `${d}d ` : ''}${dd(h)}h ${dd(m)}min ${dd(s % 60)}s`;
  return (
    <span className={`tabular-nums ${className}`} role="timer" aria-live="off">
      {texto}
    </span>
  );
}
