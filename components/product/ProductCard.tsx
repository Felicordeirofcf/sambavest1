'use client';

import Link from 'next/link';
import { useCartStore } from '../../store/cartStore';
import type { Product } from '../../lib/products';

export default function ProductCard({ product }: { product: Product }) {
  const { addItem, openCart } = useCartStore();

  const handleQuickAdd = (e: React.MouseEvent, variantSize: string) => {
    e.preventDefault();
    e.stopPropagation();

    const variant = product.variants?.find((v) => v.size === variantSize);
    const variantId = Number(variant ? variant.id : product.id);

    if (!variantId || Number.isNaN(variantId)) {
      return;
    }

    addItem({
      id: variantId,
      name: product.name,
      price: product.price,
      image: product.image,
      size: variantSize,
      quantity: 1,
    });

    openCart();
  };

  const availableVariants =
    product.variants?.filter((v) => v.stock === null || v.stock > 0) || [];

  // Lógica para pegar a imagem da Frente e a do Verso
  const imageFront = product.images?.[0] || product.image;
  const imageBack = product.images?.[1] || product.image;

  return (
    <div className="group relative flex cursor-pointer flex-col bg-[#F2F2F2]">
      {/* Container da Imagem sem bordas e mais alto (aspect-[4/5]) */}
      <Link
        href={`/produto/${product.handle}`}
        className="relative aspect-[4/5] w-full overflow-hidden bg-[#F2F2F2]"
      >
        {/* Badge Flutuante */}
        {product.badge && (
          <span className="absolute left-4 top-4 z-20 rounded-sm bg-[#0B1B34] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#C9A227] shadow-lg">
            {product.badge}
          </span>
        )}

        {/* IMAGEM FRENTE */}
        <img
          src={imageFront}
          alt={product.name}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out group-hover:opacity-0"
        />

        {/* IMAGEM VERSO (Aparece suavemente e dá um micro zoom) */}
        <img
          src={imageBack}
          alt={`${product.name} Verso`}
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-700 ease-in-out group-hover:scale-105 group-hover:opacity-100"
        />

        {/* Menu de Tamanhos */}
        <div className="absolute bottom-0 left-0 flex w-full translate-y-full flex-col gap-4 bg-white/95 p-6 backdrop-blur-md transition-all duration-500 ease-out group-hover:translate-y-0">
          <span className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[#0B1B34]">
            Adicionar à Sacola
          </span>

          <div className="flex flex-wrap justify-center gap-2">
            {availableVariants.length > 0 ? (
              availableVariants.slice(0, 6).map((variant) => (
                <button
                  key={variant.id}
                  onClick={(e) => handleQuickAdd(e, variant.size)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-[11px] font-bold uppercase text-gray-600 transition-all duration-300 hover:scale-110 hover:border-[#0B1B34] hover:bg-[#0B1B34] hover:text-white"
                >
                  {variant.size}
                </button>
              ))
            ) : (
              <span className="w-full text-center text-[11px] font-bold uppercase tracking-widest text-red-500">
                Esgotado
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Informações de Texto Centralizadas (Estilo Boutique) */}
      <Link href={`/produto/${product.handle}`} className="flex flex-col items-center justify-center p-6 text-center">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] text-[#0B1B34] transition-colors duration-300 hover:text-[#C9A227] md:text-sm">
          {product.name}
        </h3>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm font-black text-[#1E2233] md:text-base">
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[11px] text-gray-400 line-through md:text-xs">
              R$ {product.originalPrice.toFixed(2).replace('.', ',')}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}