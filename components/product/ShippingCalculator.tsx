'use client';

import { useEffect, useRef, useState } from 'react';
import { useCartStore } from '../../store/cartStore';
import { FREE_SHIPPING_THRESHOLD, type ShippingQuote } from '../../lib/shipping';

export type { ShippingQuote };

interface ShippingCalculatorProps {
  subtotal: number;
  onQuote: (quote: ShippingQuote | null) => void;
  productContext?: {
    id: number | string;
    name: string;
    price: number;
    image: string;
    size?: string;
  };
  /** CEP digitado em outro lugar (ex.: endereço do checkout). Quando completo, o frete é calculado sozinho. */
  cepExterno?: string;
}

const formatarCep = (valor: string) => {
  const d = valor.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export default function ShippingCalculator({ subtotal, onQuote, productContext, cepExterno }: ShippingCalculatorProps) {
  const { items } = useCartStore();
  const [cep, setCep] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | number | null>(null);

  const cepCotado = useRef('');

  const handleCalculate = async (cepInformado?: string) => {
    const cepLimpo = (cepInformado ?? cep).replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      alert('Por favor, digite um CEP válido com 8 dígitos.');
      return;
    }

    // Se houver itens na sacola, usa eles. Se não, usa o produto atual da página se estiver disponível.
    const itemsToCalculate = items.length > 0 
      ? items 
      : (productContext ? [{ ...productContext, quantity: 1 }] : []);

    if (itemsToCalculate.length === 0) {
      alert('Selecione uma variação ou adicione o produto à sacola para calcular o frete.');
      return;
    }

    cepCotado.current = cepLimpo;
    setIsLoading(true);
    setQuotes([]);
    onQuote(null);
    setSelectedQuoteId(null);

    try {
      const response = await fetch('/api/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cep: cepLimpo, items: itemsToCalculate }),
      });

      const data = await response.json();

      if (data.success && data.quotes && data.quotes.length > 0) {
        setQuotes(data.quotes);
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

  // Checkout: quando o cliente termina de digitar o CEP do endereço, calcula o frete para esse mesmo CEP.
  const ultimoCepExterno = useRef('');
  useEffect(() => {
    const limpo = (cepExterno || '').replace(/\D/g, '');
    if (limpo.length !== 8 || limpo === ultimoCepExterno.current) return;
    ultimoCepExterno.current = limpo;
    setCep(formatarCep(limpo));
    handleCalculate(limpo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepExterno]);

  const handleSelectQuote = (quote: ShippingQuote) => {
    setSelectedQuoteId(quote.id);
    
    let finalQuote: ShippingQuote = { 
      ...quote,
      minDays: quote.delivery_time || 3,
      maxDays: quote.delivery_time || 7,
      region: 'Nacional',
      originalPrice: quote.price,
      cep: cepCotado.current,
    };

    if (subtotal >= FREE_SHIPPING_THRESHOLD && quote.maisBarato) {
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
          onChange={(e) => setCep(formatarCep(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCalculate();
            }
          }}
          maxLength={9}
          inputMode="numeric"
          autoComplete="postal-code"
          aria-label="CEP para calcular o frete"
          placeholder="00000-000"
          className="flex-1 min-w-0 border p-3 text-sm rounded bg-white focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
        />
        <button
          type="button"
          onClick={() => handleCalculate()}
          disabled={isLoading || cep.replace(/\D/g, '').length !== 8}
          className="shrink-0 px-6 py-3 bg-[#0B1B34] text-white text-xs font-bold uppercase tracking-wider rounded hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors disabled:bg-gray-400"
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
                {subtotal >= FREE_SHIPPING_THRESHOLD && quote.maisBarato 
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