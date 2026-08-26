'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCartStore } from '../../../store/cartStore';
import ShippingCalculator from '../../../components/product/ShippingCalculator';
import { useSearchParams } from 'next/navigation';

export default function ProductClient({ product }: { product: any }) {
  const { addItem, openCart } = useCartStore();
  const searchParams = useSearchParams();
  const modeloUrl = searchParams.get('modelo');

  const variantsList = Array.isArray(product.variants) ? product.variants : [];
  const gallery = product.images && product.images.length > 0 ? product.images : [product.image];
  const sizeGuideIndex = gallery.findIndex((img: string) => img?.toLowerCase().includes('tabela') || img?.toLowerCase().includes('guia'));

  const availableModels = useMemo(() => {
    const modelsSet = new Set<string>();
    variantsList.forEach((v: any) => {
      if (v.model && v.model !== 'Geral') {
        modelsSet.add(v.model);
      } else {
        const modelAttr = v.attributes?.find((a: any) => {
          const nomeAttr = (a.name || '').toLowerCase();
          return nomeAttr.includes('modelo') || nomeAttr.includes('style') || nomeAttr.includes('model');
        });
        if (modelAttr?.option) modelsSet.add(modelAttr.option);
      }
    });
    return Array.from(modelsSet);
  }, [variantsList]);

  const [selectedModel, setSelectedModel] = useState<string>(
    modeloUrl && availableModels.includes(modeloUrl) ? modeloUrl : (availableModels[0] || '')
  );
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);
  const [dynamicVariantImage, setDynamicVariantImage] = useState<string | null>(null);

  const availableSizes = useMemo(() => {
    const sizesSet = new Set<string>();
    variantsList.forEach((v: any) => {
      const matchModel = selectedModel ? (v.model === selectedModel || v.attributes?.some((a: any) => a.option === selectedModel)) : true;
      if (!matchModel) return;

      if (v.size && v.size !== 'Único') {
        sizesSet.add(v.size);
      } else {
        const sizeAttr = v.attributes?.find((a: any) => {
          const nomeAttr = (a.name || '').toLowerCase();
          return nomeAttr.includes('tamanho') || nomeAttr.includes('size');
        });
        if (sizeAttr?.option) sizesSet.add(sizeAttr.option);
      }
    });
    return Array.from(sizesSet);
  }, [variantsList, selectedModel]);

  const matchedVariant = useMemo(() => {
    if (!selectedModel || !selectedSize) return null;
    return variantsList.find((v: any) => {
      const matchModel = v.model === selectedModel || v.attributes?.some((a: any) => a.option === selectedModel);
      const matchSize = v.size === selectedSize || v.attributes?.some((a: any) => a.option === selectedSize);
      return matchModel && matchSize;
    });
  }, [variantsList, selectedModel, selectedSize]);

  // 🎯 Sincronização dinâmica e aprimorada da imagem ao trocar o modelo
  useEffect(() => {
    if (!selectedModel) return;

    // Busca a variação compatível com o modelo selecionado
    const varSample = variantsList.find((v: any) => 
      (v.model === selectedModel || v.attributes?.some((a: any) => a.option === selectedModel)) && v.image
    );

    // O WooCommerce pode enviar a imagem como string ou como objeto { src: "..." }
    const variantImageUrl = typeof varSample?.image === 'object' ? varSample.image.src : varSample?.image;

    if (variantImageUrl) {
      // Tenta achar a imagem na galeria usando includes para ignorar parâmetros de versão (?v=123)
      const indexImg = gallery.findIndex((img: string) => 
        img === variantImageUrl || img.includes(variantImageUrl) || variantImageUrl.includes(img)
      );
      
      if (indexImg !== -1) {
        setActiveImage(indexImg);
        setDynamicVariantImage(null); // Limpa imagem forçada se achou na galeria
      } else {
        // Se a imagem existir na variação mas não estiver na galeria principal, forçamos ela a aparecer
        setDynamicVariantImage(variantImageUrl);
      }
    }
  }, [selectedModel, variantsList, gallery]);

  const currentPrice = matchedVariant ? matchedVariant.price : product.price;

  const handleAddToCart = () => {
    if (!matchedVariant) return;

    // Pega a URL final para a sacola
    const finalCartImage = typeof matchedVariant?.image === 'object' 
      ? matchedVariant.image.src 
      : (matchedVariant?.image || dynamicVariantImage || gallery[activeImage] || '');

    addItem({
      id: matchedVariant.id,
      name: `${product.name} (${selectedModel} - ${selectedSize})`,
      price: currentPrice,
      image: finalCartImage,
      size: `${selectedModel} / ${selectedSize}`,
      quantity: 1,
    });

    openCart();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <div className="flex flex-col md:flex-row gap-10 md:gap-16">
        
        {/* Lado Esquerdo: Imagem Dinâmica */}
        <div className="w-full md:w-1/2">
          <div className="bg-[#FAF7EF] aspect-[3/4] relative rounded-lg overflow-hidden border border-gray-200 shadow-sm">
            {product.badge && (
              <span className="absolute left-3 top-3 z-10 bg-[#0B1B34] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#C9A227] shadow-sm">
                {product.badge}
              </span>
            )}
            <img
              src={dynamicVariantImage || gallery[activeImage]}
              alt={product.name}
              className="w-full h-full object-contain p-6 transition-all duration-500 ease-in-out"
            />
          </div>

          {gallery.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {gallery.map((img: string, i: number) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => {
                    setActiveImage(i);
                    setDynamicVariantImage(null); // Remove a imagem forçada se o usuário clicar na miniatura manualmente
                  }}
                  className={`relative h-20 w-16 shrink-0 border bg-[#FAF7EF] transition-all rounded overflow-hidden ${
                    activeImage === i && !dynamicVariantImage ? 'border-[#0B1B34] ring-2 ring-[#0B1B34]/30' : 'border-gray-200 hover:border-gray-400'
                  }`}
                  aria-label={`Ver imagem ${i + 1}`}
                >
                  <img src={img} alt="" className="h-full w-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lado Direito: Informações e Botões Interativos */}
        <div className="w-full md:w-1/2 flex flex-col justify-center">
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-2">
            {product.name}
          </h1>

          <div className="mb-6">
            <div className="flex items-end gap-3">
              <span className="text-2xl font-black text-[#1E2233]">
                R$ {Number(currentPrice || 0).toFixed(2).replace('.', ',')}
              </span>
              {Boolean(product.regular_price && Number(product.regular_price) > Number(currentPrice)) && (
                <span className="text-sm text-gray-400 line-through mb-1">
                  R$ {Number(product.regular_price).toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">+ frete (calcule pelo seu CEP abaixo)</p>
          </div>

          <div className="text-sm text-gray-600 mb-6 font-light" dangerouslySetInnerHTML={{ __html: product.short_description || '' }} />

          {/* 👕 SELETOR DE MODELOS (BOTÕES DINÂMICOS) */}
          {availableModels.length > 0 && (
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-widest text-[#0B1B34] mb-2">
                Modelo: <span className="font-normal text-gray-600">{selectedModel}</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {availableModels.map((model: string) => {
                  const isSelected = selectedModel === model;
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => {
                        setSelectedModel(model);
                        setSelectedSize(''); // Reseta o tamanho ao trocar de modelo
                      }}
                      className={`px-5 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                        isSelected
                          ? 'border-[#0B1B34] bg-[#0B1B34] text-white shadow-md scale-105'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-[#0B1B34] hover:text-[#0B1B34]'
                      }`}
                    >
                      {model}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 📏 SELETOR DE TAMANHOS (BOTÕES DINÂMICOS) */}
          {availableSizes.length > 0 && (
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#0B1B34]">
                  Tamanho: <span className="font-normal text-gray-600">{selectedSize || 'Selecione'}</span>
                </label>
                {sizeGuideIndex >= 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveImage(sizeGuideIndex);
                      setDynamicVariantImage(null);
                    }}
                    className="text-xs font-semibold uppercase tracking-wider text-[#0B1B34] underline underline-offset-4 hover:text-[#C9A227] transition-colors"
                  >
                    Guia de tamanho
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {availableSizes.map((size: string) => {
                  const isSelected = selectedSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`h-11 min-w-[48px] px-4 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                        isSelected
                          ? 'border-[#0B1B34] bg-[#0B1B34] text-white shadow-md scale-105'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-[#0B1B34] hover:text-[#0B1B34]'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Botão de Adicionar à Sacola */}
          <button
            onClick={handleAddToCart}
            disabled={!matchedVariant}
            className="w-full py-4 bg-[#C9A227] text-[#0B1B34] uppercase tracking-widest text-sm font-bold rounded-xl hover:bg-[#0B1B34] hover:text-white transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-md"
          >
            {matchedVariant ? 'Adicionar à Sacola' : 'Selecione Modelo e Tamanho'}
          </button>

          <div className="mt-6">
            <ShippingCalculator 
              subtotal={currentPrice} 
              onQuote={() => {
                // Apenas exibe o cálculo na página do produto
              }} 
            />
          </div>
        </div>

      </div>

      {/* Descrição Completa e Guia de Medidas */}
      {product.description && (
        <div className="mt-20 pt-12 border-t border-gray-200">
          <h2 className="font-heading text-xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-6 text-center">
            Descrição e Guia de Tamanhos
          </h2>
          <div 
            className="prose max-w-none text-gray-700 text-sm leading-relaxed flex flex-col items-center justify-center [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:shadow-md"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        </div>
      )}
    </div>
  );
}