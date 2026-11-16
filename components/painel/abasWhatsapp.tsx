// Abas do WhatsApp no painel: conversas (estilo WhatsApp) e CRM (quadro kanban).
import Link from 'next/link';

export default function AbasWhatsapp({ atual }: { atual: 'conversas' | 'crm' }) {
  const aba = (id: 'conversas' | 'crm', href: string, rotulo: string) => (
    <Link
      href={href}
      aria-current={atual === id ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${atual === id ? 'bg-[#0B1B34] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
    >
      {rotulo}
    </Link>
  );
  return (
    <nav aria-label="WhatsApp" className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5">
      {aba('conversas', '/painel/atendimento', '💬 Conversas')}
      {aba('crm', '/painel/crm', '📋 CRM')}
    </nav>
  );
}
