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

  return (
    <div className="group flex cursor-pointer flex-col">
      <Link
        href={`/produto/${product.handle}`}
        className="relative aspect-[3/4] overflow-hidden bg-[#FAF7EF]"
      >
        {product.badge && (
          <span className="absolute left-2 top-2 z-10 bg-[#0B1B34] px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-[#C9A227] shadow-sm">
            {product.badge}
          </span>
        )}

        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-contain p-4 transition-transform duration-700 group-hover:scale-105"
        />

        <div className="absolute bottom-0 left-0 flex w-full translate-y-full flex-col gap-3 border-t border-gray-100 bg-white/95 p-4 backdrop-blur-sm transition-transform duration-300 group-hover:translate-y-0">
          <span className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#0B1B34]">
            Adicionar
          </span>

          <div className="flex flex-wrap justify-center gap-2">
            {availableVariants.length > 0 ? (
              availableVariants.slice(0, 6).map((variant) => (
                <button
                  key={variant.id}
                  onClick={(e) => handleQuickAdd(e, variant.size)}
                  className="flex items-center justify-center rounded-full border border-gray-300 px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-600 transition-all duration-300 hover:border-[#0B1B34] hover:bg-[#0B1B34] hover:text-white"
                >
                  {variant.size}
                </button>
              ))
            ) : (
              <span className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-[#0B1B34]">
                Esgotado
              </span>
            )}
          </div>
        </div>
      </Link>

      <Link href={`/produto/${product.handle}`} className="mt-4 flex flex-col">
        <h3 className="truncate text-[10px] md:text-sm font-medium uppercase tracking-widest text-[#1E2233] transition-colors group-hover:text-[#0B1B34]">
          {product.name}
        </h3>

        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs md:text-sm font-bold text-[#1E2233]">
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>

          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[10px] md:text-xs text-gray-400 line-through">
              R$ {product.originalPrice.toFixed(2).replace('.', ',')}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
