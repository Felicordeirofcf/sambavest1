// Painel de gestão da Samba Vest: vendas, pedidos, clientes, estoque e atendimento.
// Fica por cima do layout da loja (cabeçalho/rodapé do site não aparecem aqui).
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { logado } from '../../lib/painel/auth';
import { sair } from './actions';

export const metadata: Metadata = { title: 'Painel · Samba Vest', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const MENU = [
  { href: '/painel', rotulo: 'Visão geral' },
  { href: '/painel/pedidos', rotulo: 'Pedidos' },
  { href: '/painel/crm', rotulo: 'CRM WhatsApp' },
  { href: '/painel/clientes', rotulo: 'Clientes' },
  { href: '/painel/produtos', rotulo: 'Produtos e estoque' },
  { href: '/painel/financeiro', rotulo: 'Financeiro' },
  { href: '/atendimento', rotulo: 'Atendimento WhatsApp' },
  { href: '/painel/integracoes', rotulo: 'Integrações' },
];

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const entrou = await logado();
  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-slate-50 text-slate-900 font-sans">
      {/* a página da loja fica atrás do painel: trava a rolagem dela */}
      <style>{'body{overflow:hidden} a[aria-label="Falar no WhatsApp"]{display:none!important}'}</style>
      {entrou ? (
        <div className="min-h-full md:flex">
          <aside className="md:w-56 md:min-h-screen bg-[#0B1B34] text-white md:sticky md:top-0 shrink-0">
            <div className="px-5 py-4 flex md:block items-center justify-between">
              <Link href="/painel" className="font-semibold tracking-wide">
                Samba Vest <span className="text-[#C9A227]">Painel</span>
              </Link>
            </div>
            <nav className="flex md:flex-col gap-1 px-3 pb-3 overflow-x-auto text-sm">
              {MENU.map((m) => (
                <Link key={m.href} href={m.href} className="px-3 py-2 rounded-md hover:bg-white/10 whitespace-nowrap">
                  {m.rotulo}
                </Link>
              ))}
              <a href="https://api.sambavest.com/wp-admin/" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-md hover:bg-white/10 whitespace-nowrap text-white/70">
                WooCommerce ↗
              </a>
              <form action={sair} className="md:mt-4">
                <button className="px-3 py-2 rounded-md hover:bg-white/10 text-white/70 w-full text-left">Sair</button>
              </form>
            </nav>
          </aside>
          <div className="flex-1 min-w-0 p-4 md:p-8">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
