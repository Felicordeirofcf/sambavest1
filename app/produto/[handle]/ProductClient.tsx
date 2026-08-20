'use client';

import { useState } from 'react';
import { useCartStore } from '../../../store/cartStore';
import type { Product } from '../../../lib/products';
import ShippingCalculator from '../../../components/product/ShippingCalculator';

export default function ProductClient({ product }: { product: Product }) {
  const { addItem, openCart } = useCartStore();

  const availableVariants = product.variants.filter((v) => v.stock === null || v.stock > 0);
  const gallery = product.images && product.images.length > 0 ? product.images : [product.image];
  
  // AQUI FOI ALTERADO: Agora ele busca por "tabela" ou "guia" no nome do arquivo
  const sizeGuideIndex = gallery.findIndex((img) => img.toLowerCase().includes('tabela') || img.toLowerCase().includes('guia'));

  const [selectedVariant, setSelectedVariant] = useState(availableVariants[0] || null);
  const [activeImage, setActiveImage] = useState(0);

  const handleAddToCart = () => {
    if (!selectedVariant) return;

    addItem({
      id: selectedVariant.id,
      name: product.name,
      price: product.price,
      image: product.image,
      size: selectedVariant.size,
      quantity: 1,
    });

    openCart();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <div className="flex flex-col md:flex-row gap-10 md:gap-16">
        {/* Lado Esquerdo: Imagem */}
        <div className="w-full md:w-1/2">
          <div className="bg-[#FAF7EF] aspect-[3/4] relative">
            {product.badge && (
              <span className="absolute left-3 top-3 z-10 bg-[#0B1B34] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#C9A227] shadow-sm">
                {product.badge}
              </span>
            )}
            <img
              src={gallery[activeImage]}
              alt={product.name}
              className="w-full h-full object-contain p-6"
            />
          </div>

          {/* Miniaturas da Galeria (já estava perfeito no seu código) */}
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-3">
              {gallery.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`relative h-20 w-16 shrink-0 border bg-[#FAF7EF] transition-colors ${
                    activeImage === i ? 'border-[#0B1B34]' : 'border-gray-200 hover:border-gray-400'
                  }`}
                  aria-label={`Ver imagem ${i + 1}`}
                >
                  <img src={img} alt="" className="h-full w-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lado Direito: Informações e Botões */}
        <div className="w-full md:w-1/2 flex flex-col justify-center">
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-2">
            {product.name}
          </h1>

          <div className="mb-8">
            <div className="flex items-end gap-3">
              <span className="text-xl font-bold text-[#1E2233]">
                R$ {product.price.toFixed(2).replace('.', ',')}
              </span>
              {product.originalPrice && product.originalPrice > product.price && (
                <span className="text-sm text-gray-400 line-through mb-0.5">
                  R$ {product.originalPrice.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">+ frete (calcule pelo seu CEP abaixo)</p>
          </div>

          {/* Seleção de Tamanhos */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-semibold uppercase tracking-widest text-[#1E2233]">
                Escolha o Tamanho
              </span>
              {sizeGuideIndex >= 0 && (
                <button
                  type="button"
                  onClick={() => setActiveImage(sizeGuideIndex)}
                  className="text-xs font-semibold uppercase tracking-wider text-[#0B1B34] underline underline-offset-4 hover:text-[#C9A227] transition-colors"
                >
                  Guia de Tamanhos
                </button>
              )}
            </div>

            {availableVariants.length === 0 ? (
              <p className="text-[#0B1B34] text-sm font-bold uppercase tracking-widest">Produto Esgotado</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {availableVariants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`px-6 py-2.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                      selectedVariant?.id === variant.id
                        ? 'border-[#0B1B34] bg-[#0B1B34] text-white shadow-md'
                        : 'border-gray-300 text-gray-600 hover:border-[#0B1B34] hover:text-[#0B1B34] bg-white'
                    }`}
                  >
                    {variant.size}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Botão de Adicionar ao Carrinho */}
          <button
            onClick={handleAddToCart}
            disabled={!selectedVariant}
            className="w-full py-5 bg-[#C9A227] text-[#0B1B34] uppercase tracking-widest text-sm font-bold hover:bg-[#0B1B34] hover:text-white transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            {selectedVariant ? 'Adicionar à Sacola' : 'Selecione uma opção'}
          </button>

          <div className="mt-6">
            <ShippingCalculator subtotal={product.price} />
          </div>

          <div className="mt-10 pt-8 border-t border-gray-100">
            <p className="text-gray-600 text-sm leading-relaxed font-light">
              {product.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}