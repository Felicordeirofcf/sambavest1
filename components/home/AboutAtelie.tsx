'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function AboutAtelie() {
  return (
    <section className="w-full bg-[#0B1B34] py-16 md:py-24 my-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center gap-10">
        {/* Imagem de destaque */}
        <div className="relative w-full md:w-1/2 h-[360px] md:h-[440px] flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-[#C9A227]/10 blur-3xl" />
          <Image
            src="/products/beija-flor-2025-laila.webp"
            alt="Camisa oficial de enredo Samba Vest"
            fill
            sizes="(max-width: 768px) 90vw, 480px"
            className="relative z-10 object-contain drop-shadow-2xl"
          />
        </div>

        {/* Textos e Botão */}
        <div className="w-full md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left">
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold uppercase tracking-widest text-white mb-4">
            A Samba Vest
          </h2>
          <div className="w-16 h-0.5 bg-[#C9A227] mb-6 hidden md:block"></div>
          <p className="text-white/75 mb-8 leading-relaxed">
            Vestimos a paixão pelo carnaval. A Samba Vest produz camisas oficiais de enredo
            das escolas campeãs, com estampas exclusivas, tecido leve e de secagem rápida —
            pensadas para ensaios técnicos, blocos e para o grande dia do desfile.
          </p>
          <Link href="/quem-somos">
            <button className="px-8 py-3 border border-[#C9A227] text-[#C9A227] uppercase tracking-widest text-sm font-bold hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors">
              Conheça Nossa História
            </button>
          </Link>

          <div className="relative mt-10 h-24 w-24 md:h-28 md:w-28">
            <Image
              src="/samba-vest-logo-colorido.png"
              alt="Logo Samba Vest"
              fill
              sizes="112px"
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
