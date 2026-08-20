'use client';

import Link from 'next/link';
import { categories } from '../../lib/products';

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5521999999999';
const WHATSAPP_DISPLAY = process.env.NEXT_PUBLIC_WHATSAPP_DISPLAY || '(21) 99999-9999';
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contato@sambavest.com.br';

export default function Footer() {
  return (
    <footer className="w-full bg-[#0B1B34] border-t border-[#0B1B34] pt-16 pb-8 mt-20 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Colunas Superiores */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">

          {/* Departamentos */}
          <div className="flex flex-col gap-3">
            <h3 className="font-heading font-semibold text-base mb-2 text-[#C9A227]">Departamentos</h3>
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/categoria/${cat.slug}`}
                className="text-sm text-white/70 hover:text-[#C9A227] transition-colors"
              >
                {cat.name}
              </Link>
            ))}
          </div>

          {/* Navegação */}
          <div className="flex flex-col gap-3">
            <h3 className="font-heading font-semibold text-base mb-2 text-[#C9A227]">Navegação</h3>
            <Link href="/quem-somos" className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">Quem Somos</Link>
            <Link href="/contato" className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">Atendimento</Link>
            <Link href="/rastrear-pedido" className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">Rastrear Pedido</Link>
            <Link href="/minha-conta" className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">Minha Conta</Link>
            <Link href="/pedidos" className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">Pedidos</Link>
            <Link href="/politica-de-privacidade" className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">Política de Privacidade</Link>
            <Link href="/trocas-e-devolucoes" className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">Trocas e Devoluções</Link>
          </div>

          {/* Entre em contato */}
          <div className="flex flex-col gap-3">
            <h3 className="font-heading font-semibold text-base mb-2 text-[#C9A227]">Entre em contato</h3>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">
              {WHATSAPP_DISPLAY}
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-white/70 hover:text-[#C9A227] transition-colors">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        {/* Linha Divisória */}
        <div className="w-full border-t border-white/10 my-8"></div>

        {/* Meios de Pagamento e Direitos Reservados */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-semibold text-sm mr-2 text-white/80">Meios de pagamento</span>
            {/* Aqui usamos badges simulando os ícones para ficar igual ao layout */}
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-blue-800 rounded">VISA</span>
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-red-500 rounded">Mastercard</span>
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-blue-500 rounded">Amex</span>
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-blue-900 rounded">Diners</span>
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-black rounded">Elo</span>
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-red-600 rounded">Hipercard</span>
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-gray-700 rounded">Boleto</span>
              <span className="px-2 py-1 border border-white/20 bg-white text-xs font-bold text-teal-500 rounded flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                Pix
              </span>
            </div>
          </div>

          <div className="text-xs text-white/50 text-center md:text-left">
            © {new Date().getFullYear()} Samba Vest. Todos os direitos reservados.
          </div>
        </div>

      </div>
    </footer>
  );
}
