'use client';

// Menu do painel: grupos por área, ícone em cada item e a tela atual marcada.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const ICONES: Record<string, ReactNode> = {
  geral: ic(<path d="M4 19V10m6 9V5m6 14v-7m4 7H3" />),
  pedidos: ic(<><path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></>),
  financeiro: ic(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>),
  crm: ic(<><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /></>),
  clientes: ic(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.6M18.5 19a5 5 0 0 0-2.4-4.3" /></>),
  atendimento: ic(<><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /></>),
  produtos: ic(<><path d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3-2 2h-4L8 4Z" /></>),
  integracoes: ic(<><path d="M9 7V4M15 7V4M7 7h10v4a5 5 0 0 1-10 0V7ZM12 16v4" /></>),
  alertas: ic(<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  anuncios: ic(<><path d="M4 10v4h3l6 4V6l-6 4H4Z" /><path d="M17 9a4 4 0 0 1 0 6" /></>),
  fotos: ic(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 8" /></>),
  woo: ic(<><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
};

// Menu enxuto (uso diário). O que é técnico ou raro fica em Configurações.
const ITENS: { href: string; rotulo: string; icone: string }[] = [
  { href: '/painel', rotulo: 'Início', icone: 'geral' },
  { href: '/painel/pedidos', rotulo: 'Pedidos', icone: 'pedidos' },
  { href: '/painel/clientes', rotulo: 'Clientes', icone: 'clientes' },
  { href: '/painel/crm', rotulo: 'WhatsApp', icone: 'crm' },
  { href: '/painel/anuncios', rotulo: 'Anúncios', icone: 'anuncios' },
  { href: '/painel/produtos', rotulo: 'Estoque', icone: 'produtos' },
  { href: '/painel/financeiro', rotulo: 'Financeiro', icone: 'financeiro' },
];

/** Telas que ficam dentro de Configurações (o ícone de engrenagem acende nelas). */
export const TELAS_CONFIG = ['/painel/configuracoes', '/painel/alertas', '/painel/whatsapp', '/painel/integracoes', '/painel/fotos-black'];

const ENGRENAGEM = ic(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>
);

export default function Menu() {
  const caminho = usePathname() || '';
  const ativo = (href: string) => (href === '/painel' ? caminho === '/painel' : caminho === href || caminho.startsWith(`${href}/`));
  const naConfig = TELAS_CONFIG.some((t) => caminho === t || caminho.startsWith(`${t}/`));
  return (
    <nav aria-label="Menu do painel" className="flex flex-1 md:flex-col items-center gap-1 overflow-x-auto px-2 md:px-0 md:pb-4">
      {ITENS.map((i) => (
        <Link key={i.href} href={i.href} className="sv-trilho-link" aria-current={ativo(i.href) ? 'page' : undefined} title={i.rotulo}>
          {ICONES[i.icone]}
          <span>{i.rotulo}</span>
        </Link>
      ))}
      <Link href="/painel/configuracoes" className="sv-trilho-link md:mt-auto" aria-current={naConfig ? 'page' : undefined} title="Configurações">
        {ENGRENAGEM}
        <span>Config.</span>
      </Link>
    </nav>
  );
}
