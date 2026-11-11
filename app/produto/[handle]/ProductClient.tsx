'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCartStore } from '../../../store/cartStore';
import ShippingCalculator from '../../../components/product/ShippingCalculator';
import { useSearchParams } from 'next/navigation';
import { rastrear, dadosItens } from '../../../lib/pixel';
import Image from 'next/image';
import { podeOtimizar } from '../../../lib/imagem';
import { WHATSAPP_NUMBER } from '../../../lib/whatsapp';

export default function ProductClient({ product }: { product: any }) {
  const { addItem, openCart } = useCartStore();
  const searchParams = useSearchParams();
  const modeloUrl = searchParams.get('modelo');

  // Tipagem explícita para o TypeScript do Vercel
  const fallbackAssets: string[] = [
    // 'URL_DA_SUA_ARTE_DE_MODELOS_E_MEDIDAS.jpg',
  ];

  // Meta Pixel: visualização do produto (o ID do produto pai casa com item_group_id do catálogo)
  useEffect(() => {
    if (!product?.id) return;
    rastrear('ViewContent', {
      content_type: 'product_group',
      content_ids: [String(product.id)],
      content_name: product.name,
      currency: 'BRL',
      value: Number(product.price) || 0,
    });
  }, [product?.id, product?.name, product?.price]);

  const variantsList = useMemo(() => {
    return Array.isArray(product?.variants) ? product.variants : [];
  }, [product?.variants]);

  const rawGallery: string[] = useMemo(() => {
    if (product?.images && product.images.length > 0) {
      return product.images.map((img: any) => (typeof img === 'string' ? img : img?.src || ''));
    }
    return [typeof product?.image === 'string' ? product.image : (product?.image?.src || '')].filter(Boolean);
  }, [product]);

  const gallery = useMemo(() => {
    if (rawGallery.length === 0 && fallbackAssets.length > 0) {
      return fallbackAssets;
    }
    return Array.from(new Set([...rawGallery, ...fallbackAssets])).filter(Boolean);
  }, [rawGallery, fallbackAssets]);

  const sizeGuideIndex = gallery.findIndex((img: string) => 
    img?.toLowerCase().includes('tabela') || img?.toLowerCase().includes('guia') || img?.toLowerCase().includes('medidas')
  );

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
  const [avisoTamanho, setAvisoTamanho] = useState(false);

  const imagemDaVariante = (v: any): string =>
    typeof v?.image === 'object' ? v?.image?.src || '' : v?.image || '';

  // Foto do modelo escolhido (ex.: Regata mostra a foto da regata)
  const imagemDoModelo = (modelo: string): string => {
    const v = variantsList.find(
      (x: any) => extractModelFromVariant(x).toLowerCase() === modelo.toLowerCase() && imagemDaVariante(x)
    );
    return v ? imagemDaVariante(v) : '';
  };

  const mostrarFotoDoModelo = (modelo: string) => {
    const img = imagemDoModelo(modelo);
    const idx = img ? gallery.indexOf(img) : -1;
    if (idx >= 0) setActiveImage(idx);
  };

  // Veio da vitrine com ?modelo=Regata: já abre na foto desse modelo
  useEffect(() => {
    if (matchedUrlModel) mostrarFotoDoModelo(matchedUrlModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedUrlModel]);

  // Tamanho esgotado no WooCommerce (não deixa o cliente escolher e só descobrir no pagamento)
  const tamanhoEsgotado = (size: string): boolean => {
    const v = variantsList.find((x: any) => {
      const mesmoModelo = selectedModel ? extractModelFromVariant(x).toLowerCase() === selectedModel.toLowerCase() : true;
      return mesmoModelo && extractSizeFromVariant(x).toLowerCase() === size.toLowerCase();
    });
    return v?.stock_status === 'outofstock';
  };

  const availableSizes = useMemo(() => {
    const sizesSet = new Set<string>();
    variantsList.forEach((v: any) => {
      const varModel = extractModelFromVariant(v);
      const matchModel = selectedModel ? varModel.toLowerCase() === selectedModel.toLowerCase() : true;
      if (!matchModel) return;

      const sz = extractSizeFromVariant(v);
      if (sz) sizesSet.add(sz);
    });

    const ordemTamanhos = ['pp', 'p', 'm', 'g', 'gg', 'xg', 'exg', 'xgg', 'g1', 'g2', 'g3', 'único'];
    return Array.from(sizesSet).sort((a, b) => {
      const idxA = ordemTamanhos.indexOf(a.toLowerCase());
      const idxB = ordemTamanhos.indexOf(b.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [variantsList, selectedModel]);

  const matchedVariant = useMemo(() => {
    if (availableModels.length > 0 && !selectedModel) return null;
    // Produto sem tamanho (simples ou "tamanho único"): a variante é a do modelo escolhido
    if (availableSizes.length === 0) {
      const doModelo = variantsList.filter((v: any) =>
        availableModels.length > 0 ? extractModelFromVariant(v).toLowerCase() === selectedModel.toLowerCase() : true
      );
      return doModelo.length === 1 ? doModelo[0] : variantsList.length === 1 ? variantsList[0] : null;
    }
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
  }, [variantsList, selectedModel, selectedSize, availableModels, availableSizes]);

  const baseProductPrice = Number(product?.price || 0);
  const currentPrice = matchedVariant && Number(matchedVariant.price) > 0 ? Number(matchedVariant.price) : baseProductPrice;
  const precoPix = currentPrice * 0.90;
  // Preço "de" (riscado): o da variação escolhida; antes da escolha, o do produto
  const precoCheio = Number(matchedVariant?.regular_price || product?.regular_price || 0);

  const handleAddToCart = () => {
    if (matchedVariant && !(currentPrice > 0)) {
      alert('Este item está sem preço no momento. Fale com a gente pelo WhatsApp.');
      return;
    }
    if (!matchedVariant) {
      // Avisa o cliente em vez de deixar o botão "morto"
      setAvisoTamanho(true);
      document.getElementById('escolha-tamanho')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (matchedVariant.stock_status === 'outofstock') {
      alert('Este tamanho está esgotado. Escolha outro tamanho.');
      return;
    }

    // TRAVA DE SEGURANÇA: Garante que o modelo da variação bate com o modelo selecionado na tela
    const variantModelCheck = extractModelFromVariant(matchedVariant);
    if (variantModelCheck && variantModelCheck.toLowerCase() !== selectedModel.toLowerCase()) {
      alert("Erro de sincronização de modelo. Por favor, selecione o tamanho novamente.");
      return;
    }

    // Foto da sacola: a do modelo escolhido (nunca a tabela de medidas que estiver aberta na galeria)
    const finalCartImage =
      imagemDaVariante(matchedVariant) ||
      imagemDoModelo(selectedModel) ||
      gallery.find((_: string, i: number) => i !== sizeGuideIndex) ||
      gallery[0] ||
      '';

    // CORREÇÃO: Envia SEMPRE o preço base (cheio) para a sacola.
    // O desconto do Pix será calculado apenas na tela de checkout se a forma de pagamento for Pix.
    addItem({
      id: matchedVariant.id,
      name: `${product.name} ${selectedModel ? `(${selectedModel} - ${selectedSize})` : `(${selectedSize})`}`,
      price: currentPrice, 
      image: finalCartImage,
      size: selectedModel ? `${selectedModel} / ${selectedSize}` : selectedSize,
      quantity: 1,
    });

    rastrear('AddToCart', {
      ...dadosItens([{ id: matchedVariant.id, quantidade: 1, preco: currentPrice }]),
      content_name: product.name,
    });

    openCart();
  };

  const displayedImage = gallery[activeImage] || '';
  
  const whatsappMessage = encodeURIComponent(`Olá! Tenho dúvida sobre o produto: ${product?.name} (${selectedModel ? selectedModel : 'Modelo padrão'})`);
  const whatsappUrl = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=${whatsappMessage}&type=phone_number&app_absent=0`;

  return (
    <div className="w-full min-h-screen bg-[#FAF7EF] text-[#0B1B34]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
        <div className="flex flex-col md:flex-row gap-10 md:gap-16">
          
          <div className="w-full md:w-1/2">
            <div className="bg-white aspect-[3/4] relative rounded-lg overflow-hidden border border-gray-200 shadow-sm">
              {product?.badge && (
                <span className="absolute left-3 top-3 z-10 bg-[#0B1B34] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#C9A227] shadow-sm">
                  {product.badge}
                </span>
              )}
              {displayedImage && (
                <Image
                  src={displayedImage}
                  alt={product?.name || 'Produto'}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                  unoptimized={!podeOtimizar(displayedImage)}
                  className="w-full h-full object-contain p-6 transition-all duration-300 ease-in-out"
                />
              )}
            </div>

            {gallery.length > 1 && (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {gallery.map((img: string, i: number) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`relative h-20 w-16 shrink-0 border bg-white transition-all rounded overflow-hidden cursor-pointer ${
                      activeImage === i ? 'border-[#0B1B34] ring-2 ring-[#0B1B34]/30 scale-105' : 'border-gray-200 hover:border-gray-400'
                    }`}
                    aria-label={`Ver imagem ${i + 1}`}
                  >
                    <Image src={img} alt="" fill sizes="64px" unoptimized={!podeOtimizar(img)} className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-full md:w-1/2 flex flex-col justify-center">
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-2">
              {product?.name}
            </h1>

            <div className="mb-6">
              <div className="flex items-end gap-3">
                <span className="text-2xl font-black text-[#1E2233]">
                  R$ {Number(currentPrice || 0).toFixed(2).replace('.', ',')}
                </span>
                {precoCheio > Number(currentPrice) && (
                  <span className="text-sm text-gray-400 line-through mb-1">
                    R$ {precoCheio.toFixed(2).replace('.', ',')}
                  </span>
                )}
              </div>

              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold tracking-wide text-emerald-700">
                  R$ {precoPix.toFixed(2).replace('.', ',')} <span className="font-extrabold text-emerald-800">no Pix</span> <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded font-black">10% OFF</span>
                </span>
              </div>

              <p className="mt-2 text-xs text-gray-500">Camisa oficial/licenciada</p>
            </div>

            {product?.short_description && (
              <div className="text-sm text-gray-600 mb-6 font-light" dangerouslySetInnerHTML={{ __html: product.short_description }} />
            )}

            {availableModels.length > 0 && (
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#0B1B34] mb-2">
                  Escolha o modelo
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
                          mostrarFotoDoModelo(model);
                        }}
                        className={`px-5 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                          isSelected
                            ? 'border-[#0B1B34] bg-[#0B1B34] text-[#C9A227] shadow-md scale-105'
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

            {availableSizes.length > 0 && (
              <div className="mb-6" id="escolha-tamanho">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#0B1B34] mb-2">
                  Escolha o tamanho
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {availableSizes.map((size: string) => {
                    const isSelected = selectedSize.toLowerCase() === size.toLowerCase();
                    const esgotado = tamanhoEsgotado(size);
                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={esgotado}
                        aria-pressed={isSelected}
                        title={esgotado ? 'Esgotado' : undefined}
                        onClick={() => {
                          setSelectedSize(size);
                          setAvisoTamanho(false);
                        }}
                        className={`h-11 min-w-[48px] px-4 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                          esgotado
                            ? 'border-gray-200 bg-gray-100 text-gray-300 line-through cursor-not-allowed'
                            : isSelected
                            ? 'border-[#0B1B34] bg-[#0B1B34] text-[#C9A227] shadow-md scale-105'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-[#0B1B34] hover:text-[#0B1B34]'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>

                {avisoTamanho && !selectedSize && (
                  <p role="alert" className="mt-2 text-xs font-bold text-red-600">
                    Escolha um tamanho para adicionar à sacola.
                  </p>
                )}

                {sizeGuideIndex >= 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setActiveImage(sizeGuideIndex)}
                      className="text-xs font-semibold uppercase tracking-wider text-[#0B1B34] underline underline-offset-4 hover:text-[#C9A227] transition-colors cursor-pointer"
                    >
                      Ver guia de medidas
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleAddToCart}
              className={`w-full py-4 uppercase tracking-widest text-sm font-extrabold rounded-xl transition-colors shadow-md ${
                matchedVariant ? 'bg-[#C9A227] text-[#0B1B34] hover:bg-[#b08d1e]' : 'bg-gray-200 text-gray-400'
              } flex items-center justify-center gap-2 mb-3 cursor-pointer`}
            >
              <span>🛒</span> {matchedVariant ? 'Adicionar à Sacola' : 'Selecione as Opções'}
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-[#0B1B34] border border-[#0B1B34] text-white uppercase tracking-widest text-xs font-bold rounded-xl hover:bg-[#132a4e] transition-colors flex items-center justify-center gap-2 mb-6 shadow-sm"
            >
              <span className="text-emerald-400 text-sm font-black">💬</span> Tirar dúvidas no WhatsApp
            </a>

            <div className="grid grid-cols-3 gap-2 py-4 border-t border-b border-gray-300 text-center text-xs text-gray-700 mb-6">
              <div className="flex flex-col items-center gap-1">
                <span className="text-lg">🔒</span>
                <span className="font-semibold">Pagamento seguro</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-lg">🔄</span>
                <span className="font-semibold">Troca por tamanho</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-lg">📦</span>
                <span className="font-semibold">Envio para todo o Brasil</span>
              </div>
            </div>

            <div className="mt-2">
              <ShippingCalculator 
                subtotal={currentPrice} 
                onQuote={() => {}} 
                productContext={matchedVariant ? {
                  id: matchedVariant.id,
                  name: `${product?.name} (${selectedModel} - ${selectedSize})`,
                  price: currentPrice * 0.90,
                  image: displayedImage,
                  size: `${selectedModel} / ${selectedSize}`
                } : undefined}
              />
            </div>
          </div>

        </div>

        <div className="mt-20 pt-12 border-t border-gray-300">
          <h2 className="font-heading text-xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-8 text-center">
            Por que vestir a sua paixão?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white border-2 border-gray-200 p-6 rounded-xl text-center shadow-sm hover:border-[#0B1B34] transition-all">
              <span className="text-2xl mb-3 block">✨</span>
              <h3 className="text-sm font-extrabold text-[#0B1B34] uppercase mb-2">Exclusividade</h3>
              <p className="text-xs text-gray-600 leading-relaxed">Vista a história, a arte e a emoção de cada enredo e torcida na avenida.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 p-6 rounded-xl text-center shadow-sm hover:border-[#0B1B34] transition-all">
              <span className="text-2xl mb-3 block">👕</span>
              <h3 className="text-sm font-extrabold text-[#0B1B34] uppercase mb-2">Modelos para você</h3>
              <p className="text-xs text-gray-600 leading-relaxed">Regata, baby look, vestido ou unissex. Escolha o que mais combina com seu estilo.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 p-6 rounded-xl text-center shadow-sm hover:border-[#0B1B34] transition-all">
              <span className="text-2xl mb-3 block">📏</span>
              <h3 className="text-sm font-extrabold text-[#0B1B34] uppercase mb-2">Guia de Tamanhos</h3>
              <p className="text-xs text-gray-600 leading-relaxed">Consulte as medidas e encontre o caimento ideal para o seu máximo conforto.</p>
            </div>
          </div>

          {product?.description && (
            <div className="mt-10 pt-10 border-t border-gray-300">
              <div 
                className="prose max-w-none text-gray-700 text-sm leading-relaxed flex flex-col items-center justify-center [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:shadow-md"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}