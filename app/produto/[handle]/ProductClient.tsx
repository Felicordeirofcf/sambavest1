'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useCartStore } from '../../../store/cartStore';
import ShippingCalculator from '../../../components/product/ShippingCalculator';
import { rastrear, dadosItens } from '../../../lib/pixel';
import { descontoPixAtual } from '../../../lib/pix';
import { marcarEtapa } from '../../../components/analytics/Etapa';
import Image from 'next/image';
import { podeOtimizar } from '../../../lib/imagem';
import { WHATSAPP_NUMBER } from '../../../lib/whatsapp';

// ViewContent uma vez por produto por carregamento (a página pode remontar ao ler o ?modelo=)
const jaRastreados = new Set<number>();

/** Camisa da Black durante a campanha: página no tema escuro, igual à página da Black. */
export type TemaBlack = { fim: string; escola: 'beija-flor' | 'viradouro'; enredo: string };

export default function ProductClient({ product, modeloUrl = null, black }: { product: any; modeloUrl?: string | null; black?: TemaBlack }) {
  const bk = Boolean(black);
  const azul = black?.escola === 'beija-flor';
  // Classes de cada tema (claro: loja normal; escuro: camisas da Black)
  const T = bk
    ? {
        pagina: 'bg-black text-white',
        palco: 'rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_50%_35%,#ffffff_0%,#eceef3_55%,#d9dce4_100%)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]',
        foto: 'object-contain p-5 sm:p-8 drop-shadow-[0_18px_30px_rgba(0,0,0,0.25)]',
        miniatura: 'bg-white border-white/20',
        miniaturaAtiva: azul ? 'border-sky-400 ring-2 ring-sky-400/60' : 'border-red-400 ring-2 ring-red-400/60',
        titulo: 'text-white',
        preco: 'text-white',
        texto: 'text-white/70',
        rotulo: 'text-white/80',
        opcao: 'border-white/20 bg-white/5 text-white hover:border-white/60',
        opcaoSel: azul ? 'border-sky-400 bg-sky-500 text-white shadow-md scale-105' : 'border-red-400 bg-red-600 text-white shadow-md scale-105',
        opcaoOff: 'border-white/10 bg-white/5 text-white/25 line-through cursor-not-allowed',
        link: 'text-white/80 hover:text-[#C9A227]',
        whats: 'bg-white/5 border border-white/20 text-white hover:bg-white/10',
        selos: 'border-white/10 text-white/80',
        cardInfo: 'bg-white/5 border border-white/10 hover:border-white/40',
        cardTitulo: 'text-white',
        cardTexto: 'text-white/60',
        divisor: 'border-white/10',
        prose: 'prose-invert text-white/70',
        frete: 'rounded-2xl bg-white p-4 text-[#0B1B34]',
      }
    : {
        pagina: 'bg-[#FAF7EF] text-[#0B1B34]',
        palco: 'rounded-lg border border-gray-200 bg-white shadow-sm',
        foto: 'object-contain p-6',
        miniatura: 'bg-white border-gray-200 hover:border-gray-400',
        miniaturaAtiva: 'border-[#0B1B34] ring-2 ring-[#0B1B34]/30',
        titulo: 'text-[#0B1B34]',
        preco: 'text-[#1E2233]',
        texto: 'text-gray-600',
        rotulo: 'text-[#0B1B34]',
        opcao: 'border-gray-300 bg-white text-gray-700 hover:border-[#0B1B34] hover:text-[#0B1B34]',
        opcaoSel: 'border-[#0B1B34] bg-[#0B1B34] text-[#C9A227] shadow-md scale-105',
        opcaoOff: 'border-gray-200 bg-gray-100 text-gray-300 line-through cursor-not-allowed',
        link: 'text-[#0B1B34] hover:text-[#C9A227]',
        whats: 'bg-[#0B1B34] border border-[#0B1B34] text-white hover:bg-[#132a4e]',
        selos: 'border-gray-300 text-gray-700',
        cardInfo: 'bg-white border-2 border-gray-200 hover:border-[#0B1B34]',
        cardTitulo: 'text-[#0B1B34]',
        cardTexto: 'text-gray-600',
        divisor: 'border-gray-300',
        prose: 'text-gray-700',
        frete: '',
      };

  const { addItem, openCart } = useCartStore();

  // Tipagem explícita para o TypeScript do Vercel
  const fallbackAssets: string[] = [
    // 'URL_DA_SUA_ARTE_DE_MODELOS_E_MEDIDAS.jpg',
  ];

  // Meta Pixel: visualização do produto (o ID do produto pai casa com item_group_id do catálogo)
  useEffect(() => {
    if (!product?.id || jaRastreados.has(product.id)) return;
    jaRastreados.add(product.id);
    marcarEtapa('produto');
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

  // Na Black, sem modelo na URL, abre no modelo que está em promoção (ex.: Unisex, não a Regata)
  const modeloEmPromocao = useMemo(() => {
    if (!black) return null;
    const v = variantsList.find((x: any) => {
      const reg = Number(x?.regular_price || 0);
      const pr = Number(x?.price || 0);
      return reg > 0 && pr > 0 && pr < reg && extractModelFromVariant(x);
    });
    const m = v ? extractModelFromVariant(v) : '';
    return availableModels.find((a) => a.toLowerCase() === m.toLowerCase()) || null;
  }, [black, variantsList, availableModels]);

  const [selectedModel, setSelectedModel] = useState<string>(
    matchedUrlModel || modeloEmPromocao || (availableModels[0] || '')
  );
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);
  const toqueX = useRef(0);
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

  // Antes de escolher o tamanho, mostra o preço do modelo escolhido
  const varianteDoModelo = useMemo(() => variantsList.find((x: any) =>
    Number(x?.price) > 0 &&
    (availableModels.length === 0 || extractModelFromVariant(x).toLowerCase() === selectedModel.toLowerCase())
  ) || null, [variantsList, availableModels, selectedModel]);
  const baseProductPrice = Number(varianteDoModelo?.price || product?.price || 0);
  const currentPrice = matchedVariant && Number(matchedVariant.price) > 0 ? Number(matchedVariant.price) : baseProductPrice;
  const pctPix = descontoPixAtual();
  const precoPix = currentPrice * (1 - pctPix);
  // Preço "de" (riscado): o da variação escolhida; antes da escolha, o do produto
  const precoCheio = Number(matchedVariant?.regular_price || varianteDoModelo?.regular_price || product?.regular_price || 0);

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

    marcarEtapa('sacola');
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
    <div className={`w-full min-h-screen ${T.pagina}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
        <div className="flex flex-col md:flex-row gap-10 md:gap-16">
          
          <div className="w-full md:w-1/2">
            <div
              className={`group/foto relative aspect-[4/5] overflow-hidden ${T.palco}`}
              onTouchStart={(e) => (toqueX.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                const dx = e.changedTouches[0].clientX - toqueX.current;
                if (Math.abs(dx) > 40 && gallery.length > 1) setActiveImage((i) => (i + (dx < 0 ? 1 : -1) + gallery.length) % gallery.length);
              }}
            >
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
                  className={`h-full w-full transition-all duration-300 ease-in-out ${T.foto}`}
                />
              )}
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Foto anterior"
                    onClick={() => setActiveImage((i) => (i - 1 + gallery.length) % gallery.length)}
                    className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white opacity-90 backdrop-blur transition hover:bg-black/75 md:opacity-0 md:group-hover/foto:opacity-100"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Próxima foto"
                    onClick={() => setActiveImage((i) => (i + 1) % gallery.length)}
                    className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white opacity-90 backdrop-blur transition hover:bg-black/75 md:opacity-0 md:group-hover/foto:opacity-100"
                  >
                    ›
                  </button>
                  <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
                    {gallery.map((_: string, i: number) => (
                      <span key={i} className={`h-1.5 rounded-full transition-all ${activeImage === i ? 'w-5 bg-black/70' : 'w-1.5 bg-black/25'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {gallery.map((img: string, i: number) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`relative h-20 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl border transition-all ${
                      activeImage === i ? `${T.miniaturaAtiva} scale-105` : T.miniatura
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
            {black && (
              <p className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#C9A227] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-black">Black Friday</span>
                <span className="text-xs text-white/60">até {new Date(black.fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} · enredo: {black.enredo}</span>
              </p>
            )}
            <h1 className={`font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest mb-2 ${T.titulo}`}>
              {product?.name}
            </h1>

            <div className="mb-6">
              <div className="flex flex-wrap items-end gap-3">
                <span className={`font-black ${bk ? 'text-5xl tracking-tight' : 'text-2xl'} ${T.preco}`}>
                  R$ {Number(currentPrice || 0).toFixed(2).replace('.', ',')}
                </span>
                {precoCheio > Number(currentPrice) && (
                  <span className={`mb-1 line-through ${bk ? 'text-lg font-bold text-white/50 decoration-red-500 decoration-2' : 'text-sm text-gray-400'}`}>
                    R$ {precoCheio.toFixed(2).replace('.', ',')}
                  </span>
                )}
                {bk && precoCheio > Number(currentPrice) && (
                  <span className="mb-1.5 rotate-[-4deg] rounded-lg bg-[#C9A227] px-2 py-0.5 text-sm font-black text-black">
                    -{Math.round((1 - Number(currentPrice) / precoCheio) * 100)}%
                  </span>
                )}
              </div>
              {bk && precoCheio > Number(currentPrice) && (
                <p className="mt-2 inline-block rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-black text-emerald-300">
                  Economize R$ {(precoCheio - Number(currentPrice)).toFixed(2).replace('.', ',')}
                </p>
              )}

              {pctPix > 0 && <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold tracking-wide text-emerald-700">
                  R$ {precoPix.toFixed(2).replace('.', ',')} <span className="font-extrabold text-emerald-800">no Pix</span> <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded font-black">{Math.round(pctPix * 100)}% OFF</span>
                </span>
              </div>}

              <p className={`mt-2 text-xs ${bk ? 'text-white/50' : 'text-gray-500'}`}>Camisa oficial/licenciada</p>
            </div>

            {product?.short_description && (
              <div className={`text-sm mb-6 font-light ${T.texto}`} dangerouslySetInnerHTML={{ __html: product.short_description }} />
            )}

            {availableModels.length > 0 && (
              <div className="mb-5">
                <label className={`block text-xs font-bold uppercase tracking-widest mb-2 ${T.rotulo}`}>
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
                          isSelected ? T.opcaoSel : T.opcao
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
                <label className={`block text-xs font-bold uppercase tracking-widest mb-2 ${T.rotulo}`}>
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
                          esgotado ? T.opcaoOff : isSelected ? T.opcaoSel : T.opcao
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
                      className={`text-xs font-semibold uppercase tracking-wider underline underline-offset-4 transition-colors cursor-pointer ${T.link}`}
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
                matchedVariant
                  ? bk
                    ? azul
                      ? 'bg-sky-600 text-white hover:bg-sky-500'
                      : 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-[#C9A227] text-[#0B1B34] hover:bg-[#b08d1e]'
                  : bk
                    ? 'bg-white/10 text-white/50'
                    : 'bg-gray-200 text-gray-400'
              } flex items-center justify-center gap-2 mb-3 cursor-pointer`}
            >
              <span>🛒</span> {matchedVariant ? 'Adicionar à Sacola' : 'Selecione as Opções'}
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full py-3.5 uppercase tracking-widest text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 mb-6 shadow-sm ${T.whats}`}
            >
              <span className="text-emerald-400 text-sm font-black">💬</span> Tirar dúvidas no WhatsApp
            </a>

            <div className={`grid grid-cols-3 gap-2 py-4 border-t border-b text-center text-xs mb-6 ${T.selos}`}>
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

            <div className={`mt-2 ${T.frete}`}>
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

        <div className={`mt-20 pt-12 border-t ${T.divisor}`}>
          <h2 className={`font-heading text-xl font-extrabold uppercase tracking-widest mb-8 text-center ${T.cardTitulo}`}>
            Por que vestir a sua paixão?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className={`p-6 rounded-xl text-center shadow-sm transition-all ${T.cardInfo}`}>
              <span className="text-2xl mb-3 block">✨</span>
              <h3 className={`text-sm font-extrabold uppercase mb-2 ${T.cardTitulo}`}>Exclusividade</h3>
              <p className={`text-xs leading-relaxed ${T.cardTexto}`}>Vista a história, a arte e a emoção de cada enredo e torcida na avenida.</p>
            </div>
            <div className={`p-6 rounded-xl text-center shadow-sm transition-all ${T.cardInfo}`}>
              <span className="text-2xl mb-3 block">👕</span>
              <h3 className={`text-sm font-extrabold uppercase mb-2 ${T.cardTitulo}`}>Modelos para você</h3>
              <p className={`text-xs leading-relaxed ${T.cardTexto}`}>Regata, baby look, vestido ou unissex. Escolha o que mais combina com seu estilo.</p>
            </div>
            <div className={`p-6 rounded-xl text-center shadow-sm transition-all ${T.cardInfo}`}>
              <span className="text-2xl mb-3 block">📏</span>
              <h3 className={`text-sm font-extrabold uppercase mb-2 ${T.cardTitulo}`}>Guia de Tamanhos</h3>
              <p className={`text-xs leading-relaxed ${T.cardTexto}`}>Consulte as medidas e encontre o caimento ideal para o seu máximo conforto.</p>
            </div>
          </div>

          {product?.description && (
            <div className={`mt-10 pt-10 border-t ${T.divisor}`}>
              <div 
                className={`prose max-w-none text-sm leading-relaxed ${T.prose} flex flex-col items-center justify-center [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:shadow-md`}
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}