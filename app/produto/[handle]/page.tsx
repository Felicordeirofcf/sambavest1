import ProductClient from './ProductClient';
import { notFound } from 'next/navigation';

export const revalidate = 60; // 🚀 Cache inteligente de 1 minuto para sincronização ágil

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const resolvedParams = await Promise.resolve(params);
  const rawHandle = decodeURIComponent(resolvedParams.handle || '').trim();
  const handleOrId = rawHandle.split('?')[0].split('&')[0];

  if (!handleOrId) {
    notFound();
  }

  try {
    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      console.error('❌ Credenciais do WooCommerce não configuradas no servidor.');
      notFound();
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    let product = null;
    const isNumeric = /^\d+$/.test(handleOrId);
    
    // 1️⃣ Tenta buscar pelo ID exato ou slug exato
    if (isNumeric) {
      const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${handleOrId}`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 60 },
      });
      if (res.ok) product = await res.json();
    } else {
      const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?slug=${handleOrId}&status=publish`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 60 },
      });
      if (res.ok) {
        const list = await res.json();
        if (list.length > 0) product = list[0];
      }
    }

    // 2️⃣ Se falhou, busca na lista geral
    if (!product) {
      const resAll = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=100&status=publish`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 60 },
      });
      if (resAll.ok) {
        const allProducts = await resAll.json();
        product = allProducts.find((p: any) => 
          String(p.id) === handleOrId || 
          p.slug === handleOrId || 
          p.slug.includes(handleOrId) ||
          handleOrId.includes(p.slug)
        );

        if (!product && allProducts.length > 0) {
          console.warn(`⚠️ Aviso: Produto "${handleOrId}" não encontrado. Usando primeiro disponível.`);
          product = allProducts[0];
        }
      }
    }

    if (!product) {
      notFound();
    }

    // 3️⃣ Busca as variações do produto
    let variations: any[] = [];
    if (product.type === 'variable') {
      try {
        const resVariations = await fetch(`${wcUrl}/wp-json/wc/v3/products/${product.id}/variations?per_page=50`, {
          headers: { 'Authorization': authHeader },
          next: { revalidate: 60 },
        });
        if (resVariations.ok) {
          variations = await resVariations.json();
        }
      } catch (err) {
        console.error('⚠️ Aviso: Falha ao carregar variações.', err);
      }
    }

    // Monta a galeria base de imagens
    const baseImages: string[] = product.images && product.images.length > 0
      ? product.images.map((img: any) => img.src)
      : [];

    // Adiciona imagens das variações à galeria principal caso não estejam nela
    variations.forEach((v: any) => {
      const varImg = v.image?.src;
      if (varImg && !baseImages.includes(varImg)) {
        baseImages.push(varImg);
      }
    });

    // 4️⃣ Formatação do produto
    const productFormatado = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      type: product.type,
      price: Number(product.price || product.regular_price || 149.90),
      regular_price: Number(product.regular_price || product.price || 149.90),
      description: product.description || '',
      short_description: product.short_description || '',
      images: baseImages.length > 0 ? baseImages : [''],
      image: baseImages[0] || '',
      categories: product.categories ? product.categories.map((cat: any) => cat.slug) : [],
      attributes: product.attributes ? product.attributes.map((attr: any) => ({
        id: attr.id,
        name: attr.name,
        options: attr.options,
      })) : [],
      variants: variations.length > 0 ? variations.map((v: any) => {
        const modeloAttr = v.attributes?.find((a: any) => {
          const nome = (a.name || '').toLowerCase();
          return nome.includes('modelo') || nome.includes('style') || nome.includes('model');
        });
        const tamanhoAttr = v.attributes?.find((a: any) => {
          const nome = (a.name || '').toLowerCase();
          return nome.includes('tamanho') || nome.includes('size');
        });

        return {
          id: v.id,
          parent_id: product.id,
          model: modeloAttr?.option || 'Unissex',
          size: tamanhoAttr?.option || 'Único',
          price: Number(v.price || product.price || 149.90),
          stock: v.stock_quantity ?? (v.stock_status === 'instock' ? 10 : 0),
          stock_status: v.stock_status || 'instock',
          image: v.image?.src || '', // Retorna string vazia se a variação não tiver imagem exclusiva
          attributes: v.attributes ? v.attributes.map((attr: any) => ({
            name: attr.name,
            option: attr.option
          })) : []
        };
      }) : [
        { id: product.id, model: 'Unissex', size: 'Único', stock: 10, price: Number(product.price || 149.90), image: baseImages[0] || '' }
      ]
    };

    return <ProductClient product={productFormatado} />;

  } catch (error) {
    console.error('❌ Erro fatal ao carregar produto:', error);
    notFound();
  }
}