// Painel de gestão da Samba Vest: vendas, pedidos, clientes, estoque e atendimento.
// Fica por cima do layout da loja (cabeçalho/rodapé do site não aparecem aqui).
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Manrope } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import Menu from '../../components/painel/menu';
import { logado } from '../../lib/painel/auth';
import { cookies } from 'next/headers';
import TemaEscuro from '../../components/painel/TemaEscuro';
import { sair } from './actions';
import './painel.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--sv-fonte-display', weight: ['500', '700', '800'] });
const texto = Manrope({ subsets: ['latin'], variable: '--sv-fonte-texto' });

export const metadata: Metadata = { title: 'Painel · Samba Vest', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const entrou = await logado();
  const escuro = (await cookies()).get('sv_tema')?.value === 'escuro';
  return (
    <div className={`sv ${escuro ? 'sv-escuro' : ''} ${display.variable} ${texto.variable} fixed inset-0 z-[1000] overflow-y-auto antialiased`}>
      {/* a página da loja fica atrás do painel: trava a rolagem dela */}
      <style>{'body{overflow:hidden} a[aria-label="Falar no WhatsApp"]{display:none!important}'}</style>
      {entrou ? (
        <div className="min-h-full md:flex">
          <aside className="sticky top-0 z-20 flex shrink-0 items-center overflow-x-auto border-b border-slate-200 bg-white [scrollbar-width:none] md:h-screen md:w-[84px] md:flex-col md:overflow-visible md:border-b-0 md:border-r">
            <Link href="/painel" className="sv-display hidden md:grid h-16 w-full place-items-center border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-[0.25em] text-slate-500" title="Samba Vest">
              SVEST
            </Link>
            <div className="flex shrink-0 md:w-full md:min-w-0 md:flex-1 md:shrink md:flex-col md:pt-4">
              <Menu />
            </div>
            <div className="shrink-0 px-1 md:w-full md:px-0 md:pb-1 flex justify-center">
              <TemaEscuro inicial={escuro} />
            </div>
            <form action={sair} className="shrink-0 px-2 md:w-full md:px-0 md:pb-4">
              <button className="sv-trilho-link w-full" title="Sair">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4" />
                </svg>
                <span>Sair</span>
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
