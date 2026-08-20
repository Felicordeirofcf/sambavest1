'use client';

import { useState } from 'react';
import { calculateShipping, isValidCep, FREE_SHIPPING_THRESHOLD, type ShippingQuote } from '../../lib/shipping';

function maskCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export default function ShippingCalculator({
  subtotal,
  onQuote,
}: {
  subtotal: number;
  /** Chamado sempre que um frete válido é calculado (ex: para somar no total do checkout). */
  onQuote?: (quote: ShippingQuote | null) => void;
}) {
  const [cep, setCep] = useState('');
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [error, setError] = useState('');

  const handleCalculate = () => {
    if (!isValidCep(cep)) {
      setQuote(null);
      setError('Digite um CEP válido (ex: 20000-000).');
      onQuote?.(null);
      return;
    }

    const result = calculateShipping(cep, subtotal);
    if (!result) {
      setQuote(null);
      setError('Não encontramos esse CEP. Confira e tente novamente.');
      onQuote?.(null);
      return;
    }

    setError('');
    setQuote(result);
    onQuote?.(result);
  };

  return (
    <div className="border border-gray-200 bg-[#FAF7EF] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#1E2233]">
        Calcular frete e prazo
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Seu CEP"
          value={cep}
          onChange={(e) => setCep(maskCep(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
          maxLength={9}
          className="w-full max-w-[160px] border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#0B1B34] focus:outline-none"
        />
        <button
          type="button"
          onClick={handleCalculate}
          className="bg-[#0B1B34] px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#C9A227] hover:text-[#0B1B34]"
        >
          Calcular
        </button>
      </div>

      <a
        href="https://buscacepinter.correios.com.br/app/endereco/index.php"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-[11px] text-gray-500 underline underline-offset-2 hover:text-[#0B1B34]"
      >
        Não sei meu CEP
      </a>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {quote && (
        <div className="mt-4 border-t border-gray-200 pt-3 text-sm text-[#1E2233]">
          <p>
            <span className="font-semibold">{quote.region}</span>
          </p>
          <p className="mt-1">
            {quote.price === 0 ? (
              <span className="font-bold text-[#0B1B34]">Frete grátis 🎉</span>
            ) : (
              <>
                Frete: <span className="font-bold">R$ {quote.price.toFixed(2).replace('.', ',')}</span>
              </>
            )}
            {' — '}
            Entrega em {quote.minDays} a {quote.maxDays} dias úteis após a postagem
          </p>
          {quote.price > 0 && (
            <p className="mt-1 text-[11px] text-gray-500">
              Frete grátis em compras acima de R$ {FREE_SHIPPING_THRESHOLD.toFixed(2).replace('.', ',')}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
