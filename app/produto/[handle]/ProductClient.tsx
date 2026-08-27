'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCartStore } from '../../../store/cartStore';
import ShippingCalculator from '../../../components/product/ShippingCalculator';
import { useSearchParams } from 'next/navigation';

export default function ProductClient({ product }: { product: any }) {
  const { addItem, openCart } = useCartStore();
  const searchParams = useSearchParams();
  const modeloUrl = searchParams.get('modelo');

  // 🛑 CORREÇÃO: useMemo garante que a lista e a galeria não sejam recriadas a cada clique, 
  // o que impedia a troca manual da foto nas miniaturas.
  const variantsList = useMemo(() => {
    return Array.isArray(product?.variants) ? product.variants : [];
  }, [product?.variants]);

  const gallery: string[] = useMemo(() => {
    if (product?.images && product.images.length > 0) {
      return product.images.map((img: any) => (typeof img === 'string' ? img : img?.src || ''));
    }
    return [typeof product?.image === 'string' ? product.image : (product?.image?.src || '')];
  }, [product]);

  const sizeGuideIndex = gallery.findIndex((img: string) => 
    img?.toLowerCase().includes('tabela') || img?.toLowerCase().includes('guia') || img?.toLowerCase().includes('medidas')
  );

  // Helper para extrair o valor do modelo de uma variação
  const extractModelFromVariant = (v: any): string => {
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

  // Helper para extrair o valor do tamanho de uma variação
  const extractSizeFromVariant = (v: any): string => {
    if (v.size && v.size !== 'Único') return v.size;
    if (v.attributes && Array.isArray(v.attributes)) {
      const found = v.attributes.find((a: any) => {
        const name = (a.name || a.slug || '').toLowerCase();
        return name.includes('tamanho') || name.includes('size');
      });
      if (found?.option) return found.option;
    }
    return '';
  };

  // 👕 CAPTAÇÃO E ORDENAÇÃO DOS MODELOS
  const availableModels = useMemo(() => {
    const modelsSet = new Set<string>();
    variantsList.forEach((v: any) => {
      const m = extractModelFromVariant(v);
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
  }, [variantsList]);

  const matchedUrlModel = useMemo(() => {
    if (!modeloUrl) return null;
    return availableModels.find(m => m.toLowerCase() === modeloUrl.toLowerCase()) || null;
  }, [modeloUrl, availableModels]);

  const [selectedModel, setSelectedModel] = useState<string>(
    matchedUrlModel || (availableModels[0] || '')
  );
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);
  const [dynamicVariantImage, setDynamicVariantImage] = useState<string | null>(null);

  // ✅ CORREÇÃO: Removemos a trava do selectedModel daqui!
  // Agora ele só altera o modelo automaticamente se a URL mudar.
  useEffect(() => {
    if (matchedUrlModel) {
      setSelectedModel(matchedUrlModel);
      setSelectedSize(''); // Limpa o tamanho ao vir de um link externo com modelo predefinido
    }
  }, [matchedUrlModel]);

  // 📏 CAPTAÇÃO DOS TAMANHOS DISPONÍVEIS PARA O MODELO ATIVO
  const availableSizes = useMemo(() => {
    const sizesSet = new Set<string>();
    variantsList.forEach((v: any) => {
      const varModel = extractModelFromVariant(v);
      const matchModel = selectedModel ? varModel.toLowerCase() === selectedModel.toLowerCase() : true;
      if (!matchModel) return;

      const sz = extractSizeFromVariant(v);
      if (sz) sizesSet.add(sz);
    });

    const ordemTamanhos = ['pp', 'p', 'm', 'g', 'gg', 'xg', 'exg', 'g1', 'g2', 'g3', 'único'];
    return Array.from(sizesSet).sort((a, b) => {
      const idxA = ordemTamanhos.indexOf(a.toLowerCase());
      const idxB = ordemTamanhos.indexOf(b.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [variantsList, selectedModel]);

  // 🚀 BUSCA DA VARIAÇÃO ATIVA
  const matchedVariant = useMemo(() => {
    if (availableModels.length > 0 && !selectedModel) return null;
    if (!selectedSize) return null;

    return variantsList.find((v: any) => {
      const varModel = extractModelFromVariant(v);
      const varSize = extractSizeFromVariant(v);

      const matchModel = availableModels.length > 0 
        ? varModel.toLowerCase() === selectedModel.toLowerCase() 
        : true;
      const matchSize = varSize.toLowerCase() === selectedSize.toLowerCase();

      return matchModel && matchSize;
    }) || null;
  }, [variantsList, selectedModel, selectedSize, availableModels]);

  // 🖼️ TROCA DINÂMICA DA FOTO AO SELECIONAR MODELO
  useEffect(() => {
    if (!selectedModel) return;

    // Procura variação que pertença ao modelo selecionado e que tenha imagem
    const varWithImage = variantsList.find((v: any) => {
      const m = extractModelFromVariant(v);
      const hasImg = Boolean(v.image || (v.images && v.images.length > 0));
      return m.toLowerCase() === selectedModel.toLowerCase() && hasImg;
    });

    let targetImgUrl = '';
    if (varWithImage) {
      if (typeof varWithImage.image === 'string') {
        targetImgUrl = varWithImage.image;
      } else if (varWithImage.image?.src) {
        targetImgUrl = varWithImage.image.src;
      } else if (Array.isArray(varWithImage.images) && varWithImage.images[0]?.src) {
        targetImgUrl = varWithImage.images[0].src;
      }
    }

    if (targetImgUrl) {
      const idxInGallery = gallery.findIndex((gUrl: string) => 
        gUrl === targetImgUrl || gUrl.includes(targetImgUrl) || targetImgUrl.includes(gUrl)
      );

      if (idxInGallery !== -1) {
        setActiveImage(idxInGallery);
        setDynamicVariantImage(null);
      } else {
        setDynamicVariantImage(targetImgUrl);
      }
    }
  }, [selectedModel, variantsList, gallery]);

  const baseProductPrice = Number(product?.price || 149.90);
  const currentPrice = matchedVariant && Number(matchedVariant.price) > 0 ? Number(matchedVariant.price) : baseProductPrice;

  const temDescontoPix = product?.categories && product.categories.includes('desconto-pix');
  const precoPix = currentPrice * 0.90;

  const handleAddToCart = () => {
    if (!matchedVariant) return;

    const finalCartImage = dynamicVariantImage || gallery[activeImage] || (typeof matchedVariant?.image === 'object' ? matchedVariant.image?.src : matchedVariant?.image) || '';

    addItem({
      id: matchedVariant.id,
      name: `${product.name} ${selectedModel ? `(${selectedModel} - ${selectedSize})` : `(${selectedSize})`}`,
      price: currentPrice,
      image: finalCartImage,
      size: selectedModel ? `${selectedModel} / ${selectedSize}` : selectedSize,
      quantity: 1,
    });

    openCart();
  };

  const displayedImage = dynamicVariantImage || gallery[activeImage] || '';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <div className="flex flex-col md:flex-row gap-10 md:gap-16">
        
        {/* Lado Esquerdo: Imagem Dinâmica */}
        <div className="w-full md:w-1/2">
          <div className="bg-[#FAF7EF] aspect-[3/4] relative rounded-lg overflow-hidden border border-gray-200 shadow-sm">
            {product?.badge && (
              <span className="absolute left-3 top-3 z-10 bg-[#0B1B34] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#C9A227] shadow-sm">
                {product.badge}
              </span>
            )}
            {displayedImage && (
              <img
                src={displayedImage}
                alt={product?.name || 'Produto'}
                className="w-full h-full object-contain p-6 transition-all duration-500 ease-in-out"
              />
            )}
          </div>

          {gallery.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {gallery.map((img: string, i: number) => (
                <button
                  key={`${img}-${i}`}
                  type="button"
                  onClick={() => {
                    setActiveImage(i);
                    setDynamicVariantImage(null);
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

        {/* Lado Direito: Informações e Seletores */}
        <div className="w-full md:w-1/2 flex flex-col justify-center">
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-2">
            {product?.name}
          </h1>

          <div className="mb-6">
            <div className="flex items-end gap-3">
              <span className="text-2xl font-black text-[#1E2233]">
                R$ {Number(currentPrice || 0).toFixed(2).replace('.', ',')}
              </span>
              {Boolean(product?.regular_price && Number(product.regular_price) > Number(currentPrice)) && (
                <span className="text-sm text-gray-400 line-through mb-1">
                  R$ {Number(product.regular_price).toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>

            {temDescontoPix && (
              <p className="mt-1 text-sm font-bold text-[#2ECC71]">
                ou R$ {precoPix.toFixed(2).replace('.', ',')} via PIX (10% OFF)
              </p>
            )}

            <p className="mt-1 text-xs text-gray-500">+ frete (calcule pelo seu CEP abaixo)</p>
          </div>

          {product?.short_description && (
            <div className="text-sm text-gray-600 mb-6 font-light" dangerouslySetInnerHTML={{ __html: product.short_description }} />
          )}

          {/* 👕 SELETOR DE MODELOS */}
          {availableModels.length > 0 && (
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-widest text-[#0B1B34] mb-2">
                Modelo: <span className="font-normal text-gray-600">{selectedModel || 'Selecione'}</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {availableModels.map((model: string) => {
                  const isSelected = selectedModel.toLowerCase() === model.toLowerCase();
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => {
                        setSelectedModel(model);
                        setSelectedSize('');
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

          {/* 📏 SELETOR DE TAMANHOS */}
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
                  const isSelected = selectedSize.toLowerCase() === size.toLowerCase();
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
            {matchedVariant ? 'Adicionar à Sacola' : 'Selecione as Opções'}
          </button>

          <div className="mt-6">
            <ShippingCalculator 
              subtotal={currentPrice} 
              onQuote={() => {}} 
              productContext={matchedVariant ? {
                id: matchedVariant.id,
                name: `${product?.name} (${selectedModel} - ${selectedSize})`,
                price: currentPrice,
                image: displayedImage,
                size: `${selectedModel} / ${selectedSize}`
              } : undefined}
            />
          </div>
        </div>

      </div>

      {/* Descrição Completa e Guia de Medidas */}
      {product?.description && (
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