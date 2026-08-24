// components/product/ProductCard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ProductCard({ product }: { product: any }) {
  const router = useRouter();
  const productIdentifier = product.id || product.slug;
  const availableVariants = Array.isArray(product.variants) ? product.variants : [];

  // Extrai apenas os Modelos únicos disponíveis
  const uniqueModels = Array.from(
    new Set(
      availableVariants
        .map((v: any) => v.model)
        .filter((model: string) => model && model !== 'Geral')
    )
  );

  const imageFrontDefault = product.images?.[0] || '';
  const imageBackDefault = product.images?.[1] || imageFrontDefault;
  
  const [currentImage, setCurrentImage] = useState(imageFrontDefault);
  const [isHovered, setIsHovered] = useState(false);
  // Estado para controlar a abertura do menu de modelos no celular por toque
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <div 
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_2px_15px_rgba(0,0,0,0.05)] transition-all duration-500 hover:border-[#C9A227] hover:shadow-2xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (!showMobileMenu) setCurrentImage(imageFrontDefault);
      }}
    >
      
      {/* Área da Imagem e Link Principal */}
      <div 
        onClick={() => {
          // No mobile, se o menu estiver fechado, ao clicar na foto ele abre o menu de modelos para facilitar a escolha
          if (uniqueModels.length > 0 && !showMobileMenu) {
            setShowMobileMenu(true);
          } else {
            router.push(`/produto/${productIdentifier}`);
          }
        }}
        className="relative aspect-[4/5] w-full overflow-hidden bg-[#F2F2F2]"
      >
        {product.badge && (
          <span className="absolute left-4 top-4 z-20 rounded-sm bg-[#0B1B34] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#C9A227] shadow-lg">
            {product.badge}
          </span>
        )}

        {/* IMAGEM DINÂMICA (Muda para o modelo ou verso) */}
        <img
          src={(isHovered || showMobileMenu) && currentImage === imageFrontDefault ? imageBackDefault : currentImage}
          alt={product.name}
          className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-in-out group-hover:scale-105"
        />

        {/* Botão para fechar o menu no celular caso queira voltar */}
        {showMobileMenu && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMobileMenu(false);
              setCurrentImage(imageFrontDefault);
            }}
            className="absolute top-2 right-2 z-40 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold md:hidden"
          >
            ✕
          </button>
        )}

        {/* Menu de Modelos (Aparece no Hover no PC e ao tocar no Card/Menu no Mobile) */}
        <div 
          className={`absolute bottom-0 left-0 flex w-full flex-col gap-2.5 bg-white/95 p-4 backdrop-blur-md transition-all duration-500 ease-out z-30 ${
            showMobileMenu ? 'translate-y-0' : 'translate-y-full group-hover:translate-y-0'
          }`}
        >
          <span className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#0B1B34]">
            Escolha o Modelo
          </span>

          <div className="flex flex-wrap justify-center gap-1.5">
            {uniqueModels.length > 0 ? (
              uniqueModels.map((modelName: any) => {
                const varSample = availableVariants.find((v: any) => v.model === modelName);

                return (
                  <button
                    key={modelName}
                    type="button"
                    onMouseEnter={() => {
                      if (varSample?.image) {
                        setCurrentImage(varSample.image);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation(); // Evita conflito com o clique do card
                      if (varSample?.image) {
                        setCurrentImage(varSample.image);
                      }
                      setShowMobileMenu(true);
                      router.push(`/produto/${productIdentifier}?modelo=${encodeURIComponent(modelName)}`);
                    }}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-[11px] font-bold uppercase text-gray-800 transition-all duration-300 hover:scale-105 hover:border-[#0B1B34] hover:bg-[#0B1B34] hover:text-white active:bg-[#0B1B34] active:text-white"
                  >
                    {modelName}
                  </button>
                );
              })
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/produto/${productIdentifier}`);
                }}
                className="w-full text-center py-2 rounded bg-[#0B1B34] text-white text-[11px] font-bold uppercase tracking-widest"
              >
                Ver Produto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Informações de Texto */}
      <Link href={`/produto/${productIdentifier}`} className="flex flex-col items-center justify-center p-6 text-center bg-white">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] text-[#0B1B34] transition-colors duration-300 group-hover:text-[#C9A227] md:text-sm">
          {product.name}
        </h3>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm font-black text-[#1E2233] md:text-base">
            R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
          </span>
          {product.regular_price && product.regular_price > product.price && (
            <span className="text-[11px] text-gray-400 line-through md:text-xs">
              R$ {Number(product.regular_price).toFixed(2).replace('.', ',')}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}