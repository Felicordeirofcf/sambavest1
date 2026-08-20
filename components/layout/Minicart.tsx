'use client';

import Link from 'next/link';
import { useCartStore } from '../../store/cartStore';
import { buildWhatsappOrderLink } from '../../lib/whatsapp';
import { FREE_SHIPPING_THRESHOLD } from '../../lib/shipping';

export default function Minicart() {
  const { items, isCartOpen, closeCart, removeItem, clearCart } = useCartStore();

  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );
  const valorParaFreteGratis = FREE_SHIPPING_THRESHOLD - subtotal;
  const progressoFrete = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);

  const handleCheckout = () => {
    if (items.length === 0) return;

    const link = buildWhatsappOrderLink(items, subtotal);
    window.open(link, '_blank', 'noopener,noreferrer');
    closeCart();
    clearCart();
  };

  return (
    <>
      {isCartOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={closeCart}
        />
      )}

      <div
        className={`fixed top-0 right-0 z-50 flex h-full w-[90%] transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out md:w-[400px] ${
          isCartOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="font-heading text-lg uppercase tracking-widest text-[#0B1B34] font-bold">
            Carrinho
          </h2>
          <button
            onClick={closeCart}
            className="text-2xl leading-none text-gray-400 hover:text-[#0B1B34] transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="border-b border-gray-100 bg-[#FAF7EF] p-4 text-center text-sm">
          {valorParaFreteGratis > 0 ? (
            <p className="text-[#1E2233]">
              Faltam{' '}
              <span className="font-bold text-[#0B1B34]">
                R$ {valorParaFreteGratis.toFixed(2).replace('.', ',')}
              </span>{' '}
              para <span className="font-bold">FRETE GRÁTIS</span>
            </p>
          ) : (
            <p className="font-bold uppercase tracking-wide text-[#0B1B34]">
              Sucesso! Você ganhou Frete Grátis
            </p>
          )}

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-[#C9A227] transition-all duration-500"
              style={{ width: `${progressoFrete}%` }}
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <p className="uppercase tracking-widest text-xs">Sua sacola está vazia.</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={`${item.id}-${item.size}`} className="flex gap-4 border-b border-gray-50 pb-4">
                <div className="relative h-24 w-20 flex-shrink-0 bg-[#FAF7EF]">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-contain p-1"
                  />
                </div>

                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex justify-between">
                      <h3 className="w-40 truncate pr-2 text-xs font-medium uppercase tracking-wider text-[#1E2233]">
                        {item.name}
                      </h3>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-sm text-gray-400 hover:text-[#0B1B34] transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-500">
                      Tamanho: {item.size}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">
                      Qtd: {item.quantity}
                    </p>
                  </div>

                  <p className="text-sm font-semibold text-[#1E2233]">
                    R$ {item.price.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Subtotal
            </span>
            <span className="text-lg font-bold text-[#1E2233]">
              R$ {subtotal.toFixed(2).replace('.', ',')}
            </span>
          </div>

          {items.length > 0 ? (
            <button
              onClick={handleCheckout}
              className="flex w-full items-center justify-center gap-2 bg-[#C9A227] py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-[#0B1B34] transition-colors hover:bg-[#0B1B34] hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 32 32" fill="currentColor" aria-hidden>
                <path d="M16.03 3.2c-6.95 0-12.58 5.62-12.58 12.56 0 2.21.58 4.37 1.68 6.27L3.2 28.8l6.95-1.82a12.6 12.6 0 0 0 5.88 1.49h.01c6.94 0 12.57-5.63 12.57-12.57 0-3.36-1.31-6.52-3.69-8.89A12.48 12.48 0 0 0 16.03 3.2Z" />
              </svg>
              Finalizar no WhatsApp
            </button>
          ) : (
            <button
              disabled
              className="w-full cursor-not-allowed bg-gray-100 py-4 text-xs font-bold uppercase tracking-[0.2em] text-gray-400"
            >
              Sacola Vazia
            </button>
          )}

          <Link
            href="/checkout"
            className="mt-3 block text-center text-[10px] uppercase tracking-widest text-gray-400 hover:text-[#0B1B34] underline underline-offset-4"
            onClick={closeCart}
          >
            Ver resumo completo do pedido
          </Link>
        </div>
      </div>
    </>
  );
}
