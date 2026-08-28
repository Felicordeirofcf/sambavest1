'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ProductCard({ product }: { product: any }) {
  const router = useRouter();
  
  const productIdentifier = product.id;
  const availableVariants = Array.isArray(product.variants) ? product.variants : [];

  // Helper para extrair imagem de uma variação (string ou objeto)
  const getVariantImageUrl = (v: any): string => {
    if (!v) return '';
    if (typeof v.image === 'string') return v.image;
    if (v.image?.src) return v.image.src;
    if (Array.isArray(v.images) && v.images[0]?.src) return v.images[0].src;
    return '';
  };

  // Helper para extrair nome do modelo
  const getVariantModelName = (v: any): string => {
    if (v.model && v.model !== 'Geral') return v.model;
    if (v.attributes && Array.isArray(v.attributes)) {
      const found = v.attributes.find((a: any) => {
        const name = (a.name || a.slug || '').toLowerCase();
        return name.includes('modelo') || name.includes('style') || name.includes('model');
      });
      if (found?.option) return found.option;
    }
    return '';
  };

  // Extrai apenas os Modelos únicos ordenados
  const uniqueModels = useMemo(() => {
    const modelsSet = new Set<string>();
    availableVariants.forEach((v: any) => {
      const m = getVariantModelName(v);
      if (m) modelsSet.add(m);
    });

    const ordemDesejada = ['unissex', 'regata', 'baby look', 'vestido', 'infantil'];
    return Array.from(modelsSet).sort((a, b) => {
      const idxA = ordemDesejada.indexOf(a.toLowerCase());
      const idxB = ordemDesejada.indexOf(b.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [availableVariants]);

  const imageFrontDefault = typeof product.images?.[0] === 'string'
    ? product.images[0]
    : product.images?.[0]?.src || product.image || '';

  const imageBackDefault = typeof product.images?.[1] === 'string'
    ? product.images[1]
    : product.images?.[1]?.src || imageFrontDefault;
  
  const [currentImage, setCurrentImage] = useState(imageFrontDefault);
  const [isHovered, setIsHovered] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // 💰 Cálculo do Desconto Pix (10% OFF)
  const productPrice = Number(product.price || 0);
  const precoPix = productPrice * 0.90;
  const temDescontoPix = product?.categories && product.categories.includes('desconto-pix');

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

        {/* IMAGEM DINÂMICA */}
        <img
          src={(isHovered || showMobileMenu) && currentImage === imageFrontDefault ? imageBackDefault : currentImage}
          alt={product.name}
          className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-in-out group-hover:scale-105"
        />

        {showMobileMenu && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMobileMenu(false);
              setCurrentImage(imageFrontDefault);
            }}
            className="absolute top-2 right-2 z-40 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold md:hidden"
            aria-label="Fechar menu de modelos"
          >
            ✕
          </button>
        )}

        {/* Menu de Modelos */}
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
              uniqueModels.map((modelName: string) => {
                const varSample = availableVariants.find((v: any) => getVariantModelName(v).toLowerCase() === modelName.toLowerCase());
                const varImg = getVariantImageUrl(varSample);

                return (
                  <button
                    key={modelName}
                    type="button"
                    onMouseEnter={() => {
                      if (varImg) setCurrentImage(varImg);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (varImg) setCurrentImage(varImg);
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

        <div className="mt-3 flex flex-col items-center gap-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-[#1E2233] md:text-base">
              R$ {productPrice.toFixed(2).replace('.', ',')}
            </span>
            {product.regular_price && Number(product.regular_price) > productPrice && (
              <span className="text-[11px] text-gray-400 line-through md:text-xs">
                R$ {Number(product.regular_price).toFixed(2).replace('.', ',')}
              </span>
            )}
          </div>

          {/* 💚 Aviso de Desconto Pix na Vitrine */}
          {temDescontoPix && (
            <span className="text-[11px] font-bold text-[#2ECC71]">
              ou R$ {precoPix.toFixed(2).replace('.', ',')} via PIX (10% OFF)
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}