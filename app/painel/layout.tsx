// Painel de gestão da Samba Vest: vendas, pedidos, clientes, estoque e atendimento.
// Fica por cima do layout da loja (cabeçalho/rodapé do site não aparecem aqui).
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Manrope } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import Menu from '../../components/painel/menu';
import { logado } from '../../lib/painel/auth';
import { sair } from './actions';
import './painel.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--sv-fonte-display', weight: ['500', '700', '800'] });
const texto = Manrope({ subsets: ['latin'], variable: '--sv-fonte-texto' });

export const metadata: Metadata = { title: 'Painel · Samba Vest', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const entrou = await logado();
  return (
    <div className={`sv ${display.variable} ${texto.variable} fixed inset-0 z-[1000] overflow-y-auto antialiased`}>
      {/* a página da loja fica atrás do painel: trava a rolagem dela */}
      <style>{'body{overflow:hidden} a[aria-label="Falar no WhatsApp"]{display:none!important}'}</style>
      {entrou ? (
        <div className="min-h-full md:flex">
          <aside className="md:w-60 md:h-screen bg-[var(--sv-noite)] text-white md:sticky md:top-0 shrink-0 flex flex-col">
            <div className="sv-faixa" aria-hidden />
            <div className="px-5 pt-5 pb-4 md:pb-7 flex items-center justify-between">
              <Link href="/painel" className="sv-display text-xl font-extrabold tracking-tight leading-none">
                Samba Vest
                <span className="block mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--sv-ouro)]">painel da loja</span>
              </Link>
              <form action={sair} className="md:hidden">
                <button className="text-sm text-white/70 px-3 py-1.5 rounded-lg border border-white/15">Sair</button>
              </form>
            </div>
            <Menu />
            <form action={sair} className="hidden md:block mt-auto px-3 pb-5">
              <button className="sv-menu-link w-full">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4" />
                </svg>
                Sair
              </button>
            </form>
          </aside>
          <div className="flex-1 min-w-0 p-4 md:p-8 lg:p-10">{children}</div>
        </div>
      ) : (
        <div className="min-h-full bg-[var(--sv-noite)]">
          <div className="sv-faixa" aria-hidden />
          {children}
        </div>
      )}
    </div>
  );
}
