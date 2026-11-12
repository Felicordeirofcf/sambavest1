'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Barra fixa de compra no celular: aparece quando os botões do topo saem da tela,
 * para o "Comprar" estar sempre à mão enquanto a pessoa rola a página.
 */
export default function BarraCompra({ preco, beija, viradouro }: { preco: string; beija: string; viradouro: string }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const alvo = document.getElementById('topo-camisas');
    if (!alvo || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(([e]) => setVisivel(!e.isIntersecting), { rootMargin: '0px 0px -40% 0px' });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      aria-hidden={!visivel}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/95 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 backdrop-blur transition-transform duration-300 md:hidden ${
        visivel ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="flex items-center gap-2 pl-[68px]">
        <span className="shrink-0 text-center leading-none">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-[#C9A227]">Black</span>
          <span className="text-lg font-black text-white">{preco}</span>
        </span>
        <Link href={beija} tabIndex={visivel ? 0 : -1} className="flex-1 rounded-xl bg-sky-600 py-2.5 text-center text-xs font-black uppercase tracking-wide text-white">
          Beija-Flor
        </Link>
        <Link href={viradouro} tabIndex={visivel ? 0 : -1} className="flex-1 rounded-xl bg-red-600 py-2.5 text-center text-xs font-black uppercase tracking-wide text-white">
          Viradouro
        </Link>
      </div>
    </div>
  );
}
