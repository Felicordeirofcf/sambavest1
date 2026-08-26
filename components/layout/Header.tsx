'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCartStore } from '../../store/cartStore';

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      // 🚀 EFEITO CARNAVALESCO: Transição suave com leve escala e mudança para tom dourado festivo
      className={`group relative py-2 font-bold transition-all duration-300 hover:scale-105 ${
        active ? 'text-[#C9A227] drop-shadow-[0_0_8px_rgba(201,162,39,0.5)]' : 'text-white/90 hover:text-[#F0DFA8]'
      }`}
    >
      {children}
      {/* Linha de destaque com gradiente carnavalesco */}
      <span
        className={`absolute -bottom-0.5 left-0 h-[2.5px] bg-gradient-to-r from-[#C9A227] via-[#F0DFA8] to-[#C9A227] transition-all duration-300 ${
          active ? 'w-full shadow-[0_0_10px_#C9A227]' : 'w-0 group-hover:w-full'
        }`}
      />
    </Link>
  );
}

export default function Header() {
  const { openCart, items, isMenuOpen, openMenu, closeMenu } = useCartStore();
  const pathname = usePathname();

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <>
      <header className="sticky top-0 z-35 w-full border-b border-[#C9A227]/30 bg-[#0B1B34]/95 px-4 py-2.5 backdrop-blur-md md:px-6 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        {/* MOBILE */}
        <div className="relative flex items-center justify-between xl:hidden min-h-[68px]">
          {/* Menu */}
          <div className="w-[40px] flex justify-start shrink-0">
            <button
              onClick={openMenu}
              className="group flex flex-col justify-center items-center w-9 h-9 space-y-1.5 focus:outline-none transition-transform active:scale-95"
              aria-label="Abrir menu"
            >
              <span className="block w-6 h-0.5 bg-[#C9A227] transition-all group-hover:w-7 group-hover:bg-[#F0DFA8]"></span>
              <span className="block w-6 h-0.5 bg-[#C9A227] transition-all group-hover:w-5 group-hover:bg-[#F0DFA8]"></span>
              <span className="block w-6 h-0.5 bg-[#C9A227] transition-all group-hover:w-7 group-hover:bg-[#F0DFA8]"></span>
            </button>
          </div>

          {/* Logo mobile centralizada com brilho suave */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
            <Link href="/" aria-label="Ir para a página inicial" className="transition-transform duration-300 hover:scale-105">
              <Image
                src="/logo-oficial-vazado.png"
                alt="Samba Vest"
                width={148}
                height={60}
                className="object-contain h-[40px] w-auto drop-shadow-[0_2px_8px_rgba(201,162,39,0.3)]"
                priority
              />
            </Link>
          </div>

          {/* Carrinho */}
          <div className="w-[40px] flex justify-end shrink-0">
            <button
              onClick={openCart}
              className={`relative text-[#C9A227] hover:text-[#F0DFA8] transition-all ${totalItems > 0 ? 'animate-bounce' : ''}`}
              aria-label="Abrir carrinho"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>

              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-gradient-to-r from-[#C9A227] to-[#F0DFA8] text-[#0B1B34] text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-[0_0_8px_#C9A227]">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* DESKTOP */}
        <div className="hidden xl:flex justify-between items-center max-w-[1600px] mx-auto">
          <div className="flex-1 flex items-center justify-start">
            <nav className="flex gap-8 text-[12px] uppercase tracking-wider font-bold">
              {/* 🚀 BOTÕES FIXOS E LIMPOS: Apenas Início e Coleção */}
              <NavLink href="/" active={pathname === '/'}>
                Início
              </NavLink>
              <NavLink href="/categoria/todos" active={pathname.startsWith('/categoria')}>
                NOSSA LOJA
              </NavLink>
            </nav>
          </div>

          <div className="flex-1 flex justify-center">
            <Link href="/" aria-label="Ir para a página inicial" className="group">
              <Image
                src="/logo-oficial-vazado.png"
                alt="Samba Vest"
                width={210}
                height={85}
                className="object-contain h-[58px] w-auto transition-all duration-500 group-hover:scale-105 group-hover:drop-shadow-[0_0_15px_rgba(201,162,39,0.5)]"
                priority
              />
            </Link>
          </div>

          <div className="flex-1 flex justify-end items-center gap-6">
            {/* Botão Meus Pedidos */}
            <Link 
              href="/meus-pedidos" 
              className="group text-xs md:text-sm uppercase font-bold flex items-center gap-2 text-white/90 hover:text-[#C9A227] transition-all duration-300"
              aria-label="Meus Pedidos"
            >
              <svg 
                className="w-6 h-6 text-[#C9A227] transition-transform group-hover:scale-110 group-hover:-translate-y-1" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
              <span className="hidden md:inline text-xs tracking-widest uppercase">Meus Pedidos</span>
            </Link>

            <button
              onClick={openCart}
              className="group text-xs md:text-sm uppercase font-bold flex items-center gap-2.5 text-white/90 hover:text-[#C9A227] transition-all duration-300"
              aria-label="Abrir carrinho"
            >
              <span className="text-xs uppercase tracking-widest group-hover:translate-x-[-2px] transition-transform">Sacola</span>

              <div className="relative p-2 rounded-full bg-white/5 border border-white/10 group-hover:border-[#C9A227] transition-colors">
                <svg
                  className="w-5 h-5 text-[#C9A227] transition-transform group-hover:scale-110"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>

                {totalItems > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-[#C9A227] to-[#F0DFA8] text-[#0B1B34] text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-[0_0_10px_#C9A227] animate-pulse">
                    {totalItems}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 xl:hidden transition-opacity"
          onClick={closeMenu}
        />
      )}

      {/* Menu mobile */}
      <div
        className={`fixed top-0 left-0 h-full w-[85%] max-w-[350px] bg-[#0B1B34] z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col xl:hidden border-r border-[#C9A227]/30 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 flex items-center border-b border-white/10 bg-black/20">
          <button
            onClick={closeMenu}
            className="text-[#C9A227] hover:text-white transition-colors p-1"
            aria-label="Fechar menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <h2 className="text-[15px] font-bold text-center flex-1 pr-6 text-[#C9A227] tracking-widest uppercase">
            Menu Samba Vest
          </h2>
        </div>

        <nav className="flex-1 flex flex-col pt-3 overflow-y-auto text-[13px] font-bold text-white/90 uppercase tracking-wider">
          <Link href="/" onClick={closeMenu} className="px-6 py-4 hover:bg-white/5 hover:text-[#C9A227] transition-colors border-b border-white/5 flex items-center justify-between">
            <span>Início</span>
            <span className="text-[#C9A227]">→</span>
          </Link>
          <Link href="/categoria/todos" onClick={closeMenu} className="px-6 py-4 hover:bg-white/5 hover:text-[#C9A227] transition-colors border-b border-white/5 flex items-center justify-between">
            <span>Coleção</span>
            <span className="text-[#C9A227]">→</span>
          </Link>
        </nav>

        {/* Seção Inferior do Menu Mobile */}
        <div className="p-5 border-t border-white/10 flex flex-col gap-4 bg-black/20">
          
          {/* Link Rastrear Pedidos Mobile */}
          <Link href="/meus-pedidos" onClick={closeMenu} className="flex items-center gap-3 text-[13px] text-white/90 font-bold hover:text-[#C9A227] transition-colors group">
            <svg className="w-5 h-5 text-[#C9A227] group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
            <span className="uppercase tracking-wider">Meus Pedidos</span>
          </Link>

          {/* Link Minha Conta Mobile */}
          <div className="flex items-center gap-3 text-[13px] text-white/90 font-bold">
            <svg className="w-5 h-5 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <Link href="/minha-conta" onClick={closeMenu} className="hover:text-[#C9A227] transition-colors uppercase tracking-wider">
              Minha Conta
            </Link>
          </div>
          
        </div>
      </div>
    </>
  );
}