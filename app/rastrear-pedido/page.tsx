'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RastreioPage() {
  const [trackingCode, setTrackingCode] = useState('');

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!trackingCode.trim()) return;

    // URL oficial de rastreio dos Correios passando o código dinamicamente
    const correiosUrl = `https://rastreamento.correios.com.br/app/index.php?codigo=${trackingCode.trim()}`;
    
    // Abre o site dos Correios em uma nova aba
    window.open(correiosUrl, '_blank');
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center bg-white px-4 text-center py-12">
      <h1 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-4">
        Rastrear Pedido
      </h1>
      <div className="w-12 h-0.5 bg-[#C9A227] mx-auto mb-6"></div>

      <p className="text-gray-500 text-sm md:text-base max-w-md mx-auto mb-10 leading-relaxed">
        Digite o código de rastreamento que você recebeu por e-mail ou WhatsApp para acompanhar a entrega do seu pedido direto pelo site dos Correios.
      </p>

      {/* Formulário de Rastreio */}
      <form onSubmit={handleTrack} className="w-full max-w-md mx-auto flex flex-col sm:flex-row gap-4 mb-12">
        <input
          type="text"
          placeholder="Ex: AA123456789BR"
          value={trackingCode}
          onChange={(e) => setTrackingCode(e.target.value.toUpperCase())} // Força o código a ficar em letras maiúsculas
          className="flex-1 border border-gray-300 p-4 text-sm focus:outline-none focus:border-[#C9A227] bg-white rounded-sm font-semibold tracking-wider text-center sm:text-left"
          required
        />
        <button
          type="submit"
          className="px-8 py-4 bg-[#0B1B34] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors rounded-sm cursor-pointer"
        >
          Rastrear
        </button>
      </form>

      <Link
        href="/"
        className="text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-[#0B1B34] transition-colors"
      >
        Voltar para a Loja
      </Link>
    </div>
  );
}