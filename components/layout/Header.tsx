'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCartStore } from '../../store/cartStore';
import { categories } from '../../lib/products';

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`group relative py-2 transition-colors ${active ? 'text-[#C9A227]' : 'text-white/90 hover:text-[#C9A227]'}`}
    >
      {children}
      <span
        className={`absolute -bottom-0.5 left-0 h-[2px] bg-[#C9A227] transition-all duration-300 ${
          active ? 'w-full' : 'w-0 group-hover:w-full'
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
      <header className="sticky top-0 z-30 w-full border-b border-[#C9A227]/20 bg-[#0B1B34]/97 px-4 py-2 backdrop-blur-md md:px-6">
        {/* MOBILE */}
        <div className="relative flex items-center justify-between xl:hidden min-h-[68px]">
          {/* Menu */}
          <div className="w-[40px] flex justify-start shrink-0">
            <button
              onClick={openMenu}
              className="flex flex-col justify-center items-center w-8 h-8 space-y-1 focus:outline-none hover:opacity-70 transition-opacity"
              aria-label="Abrir menu"
            >
              <span className="block w-6 h-0.5 bg-[#C9A227]"></span>
              <span className="block w-6 h-0.5 bg-[#C9A227]"></span>
              <span className="block w-6 h-0.5 bg-[#C9A227]"></span>
            </button>
          </div>

          {/* Logo mobile centralizada */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
            <Link href="/" aria-label="Ir para a página inicial">
              <Image
                src="/logo-wordmark.png"
                alt="Samba Vest"
                width={148}
                height={60}
                className="object-contain h-[40px] w-auto"
                priority
              />
            </Link>
          </div>

          {/* Carrinho */}
          <div className="w-[40px] flex justify-end shrink-0">
            <button
              onClick={openCart}
              className="relative text-[#C9A227] hover:opacity-70 transition-opacity"
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
                <span className="absolute -top-2 -right-2 bg-[#C9A227] text-[#0B1B34] text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-sm">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* DESKTOP */}
        <div className="hidden xl:flex justify-between items-center">
          <div className="flex-1 flex items-center justify-start">
            <nav className="flex gap-6 text-[11px] uppercase tracking-wider font-bold">
              <NavLink href="/" active={pathname === '/'}>
                Início
              </NavLink>
              {categories.map((cat) => (
                <NavLink
                  key={cat.slug}
                  href={`/categoria/${cat.slug}`}
                  active={pathname === `/categoria/${cat.slug}`}
                >
                  {cat.name}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex-1 flex justify-center">
            <Link href="/" aria-label="Ir para a página inicial">
              <Image
                src="/logo-wordmark.png"
                alt="Samba Vest"
                width={210}
                height={85}
                className="object-contain h-[58px] w-auto"
                priority
              />
            </Link>
          </div>

          <div className="flex-1 flex justify-end">
            <button
              onClick={openCart}
              className="text-xs md:text-sm uppercase font-bold flex items-center gap-2 text-white/90 hover:text-[#C9A227] transition-colors"
              aria-label="Abrir carrinho"
            >
              <span className="text-xs uppercase tracking-wide">Carrinho</span>

              <div className="relative">
                <svg
                  className="w-5 h-5"
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
                  <span className="absolute -top-2 -right-2 bg-[#C9A227] text-[#0B1B34] text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-sm">
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
          className="fixed inset-0 bg-black/50 z-40 xl:hidden transition-opacity"
          onClick={closeMenu}
        />
      )}

      {/* Menu mobile */}
      <div
        className={`fixed top-0 left-0 h-full w-[85%] max-w-[350px] bg-[#0B1B34] z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col xl:hidden ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 flex items-center border-b border-white/10">
          <button
            onClick={closeMenu}
            className="text-[#C9A227] hover:opacity-70 transition-opacity"
            aria-label="Fechar menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <h2 className="text-[15px] font-bold text-center flex-1 pr-5 text-[#C9A227]">
            Menu
          </h2>
        </div>

        <nav className="flex-1 flex flex-col pt-2 overflow-y-auto text-[14px] font-bold text-white/90 uppercase tracking-wider">
          <Link href="/" onClick={closeMenu} className="px-5 py-3.5 hover:bg-white/5 transition-colors border-b border-white/5">
            Início
          </Link>
          <Link href="/categoria/todos" onClick={closeMenu} className="px-5 py-3.5 hover:bg-white/5 transition-colors border-b border-white/5">
            Ver todos os produtos
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categoria/${cat.slug}`}
              onClick={closeMenu}
              className="px-5 py-3.5 hover:bg-white/5 transition-colors border-b border-white/5"
            >
              {cat.name}
            </Link>
          ))}
        </nav>

        <div className="p-5 border-t border-white/10 flex items-center gap-3 text-[14px] text-white/90 font-bold">
          <svg className="w-5 h-5 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>

          <Link href="/minha-conta" onClick={closeMenu} className="hover:text-[#C9A227] transition-colors">
            Minha Conta
          </Link>
        </div>
      </div>
    </>
  );
}
