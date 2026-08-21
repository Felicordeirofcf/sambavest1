'use client';

import { useCartStore } from '../../store/cartStore';
import Link from 'next/link';

export default function Minicart() {
  const { items, isOpen, closeCart, removeItem } = useCartStore();

  const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={closeCart} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-heading text-lg font-bold uppercase tracking-widest text-[#0B1B34]">Sua Sacola</h2>
            <button onClick={closeCart} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {items.length === 0 ? (
              <p className="text-center text-gray-500 py-12 text-sm uppercase tracking-wider">Sua sacola está vazia</p>
            ) : (
              items.map((item) => (
                <div key={`${item.id}-${item.size}`} className="flex gap-4 py-4 border-b last:border-0">
                  <img src={item.image} alt={item.name} className="w-16 h-20 object-contain bg-[#FAF7EF] p-1" />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between">
                        <h4 className="text-xs font-bold uppercase text-[#1E2233]">{item.name}</h4>
                        <button onClick={() => removeItem(item.id)} className="text-[10px] text-red-500 hover:underline">Remover</button>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">Tam: {item.size} | Qtd: {item.quantity}</p>
                    </div>
                    <p className="text-xs font-bold text-[#1E2233]">R$ {item.price.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="border-t p-6 bg-[#FAF7EF] space-y-4">
              <div className="flex justify-between text-sm font-bold text-[#1E2233]">
                <span>Subtotal</span>
                <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
              </div>

              {/* Botão que direciona para a página completa de checkout/endereço */}
              <Link
                href="/checkout"
                onClick={closeCart}
                className="block w-full py-4 bg-[#C9A227] text-[#0B1B34] text-center font-bold uppercase tracking-widest text-xs hover:bg-[#0B1B34] hover:text-white transition-colors shadow-md"
              >
                Ir para o Checkout
              </Link>

              <button
                onClick={closeCart}
                className="block w-full text-center text-[10px] text-gray-500 uppercase tracking-widest hover:text-[#0B1B34] underline"
              >
                Continuar Comprando
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}