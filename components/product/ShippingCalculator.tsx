'use client';

import { useState } from 'react';
import { useCartStore } from '../../store/cartStore';

// Interface do formato que vem do nosso backend
export interface ShippingQuote {
  id: number | string;
  name: string;
  price: number;
  delivery_time: number;
  company_picture?: string;
}

interface ShippingCalculatorProps {
  subtotal: number;
  onQuote: (quote: ShippingQuote | null) => void;
}

export default function ShippingCalculator({ subtotal, onQuote }: ShippingCalculatorProps) {
  const { items } = useCartStore();
  const [cep, setCep] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | number | null>(null);

  const handleCalculate = async () => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      alert('Por favor, digite um CEP válido com 8 dígitos.');
      return;
    }

    if (items.length === 0) {
      alert('Seu carrinho está vazio.');
      return;
    }

    setIsLoading(true);
    setQuotes([]);
    onQuote(null);
    setSelectedQuoteId(null);

    try {
      const response = await fetch('/api/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cep: cepLimpo, items }),
      });

      const data = await response.json();

      if (data.success && data.quotes && data.quotes.length > 0) {
        setQuotes(data.quotes);
        // Já seleciona automaticamente a opção mais barata (que é a primeira da lista)
        handleSelectQuote(data.quotes[0]);
      } else {
        alert('Não foi possível calcular o frete para este CEP no momento.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao comunicar com o servidor de fretes.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectQuote = (quote: ShippingQuote) => {
    setSelectedQuoteId(quote.id);
    
    // Regra do Frete Grátis (exemplo: acima de R$ 300 ganha frete grátis no PAC)
    const FREE_SHIPPING_THRESHOLD = 300; 
    let finalQuote = { ...quote };

    if (subtotal >= FREE_SHIPPING_THRESHOLD && quote.name.toLowerCase().includes('pac')) {
      finalQuote.price = 0;
      finalQuote.name = `${quote.name} (FRETE GRÁTIS)`;
    }

    onQuote(finalQuote);
  };

  return (
    <div className="w-full">
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          maxLength={9}
          placeholder="00000-000"
          className="flex-1 border p-3 text-sm rounded bg-white focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
        />
        <button
          onClick={handleCalculate}
          disabled={isLoading || cep.length < 8}
          className="px-6 py-3 bg-[#0B1B34] text-white text-xs font-bold uppercase tracking-wider rounded hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors disabled:bg-gray-400"
        >
          {isLoading ? 'Calculando...' : 'Calcular'}
        </button>
      </div>

      {/* Lista de Opções de Frete */}
      {quotes.length > 0 && (
        <div className="mt-4 space-y-3 bg-white border border-[#E5E5E5] rounded p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#0B1B34] mb-3">Escolha a entrega:</p>
          
          {quotes.map((quote) => (
            <label 
              key={quote.id} 
              className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-all ${
                selectedQuoteId === quote.id ? 'border-[#C9A227] bg-[#C9A227]/5' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="shippingOption"
                  value={quote.id}
                  checked={selectedQuoteId === quote.id}
                  onChange={() => handleSelectQuote(quote)}
                  className="accent-[#0B1B34] w-4 h-4"
                />
                <div>
                  <span className="block text-sm font-bold text-[#1E2233]">{quote.name}</span>
                  <span className="text-xs text-gray-500">
                    Chega em até {quote.delivery_time} {quote.delivery_time === 1 ? 'dia útil' : 'dias úteis'}
                  </span>
                </div>
              </div>
              <div className="text-sm font-extrabold text-[#0B1B34]">
                {subtotal >= 300 && quote.name.toLowerCase().includes('pac') 
                  ? <span className="text-green-600">GRÁTIS</span>
                  : `R$ ${quote.price.toFixed(2).replace('.', ',')}`
                }
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}