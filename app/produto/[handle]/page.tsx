import ProductClient from './ProductClient';
import { notFound } from 'next/navigation';

export const revalidate = 300; // 🚀 Cache de 5 minutos para carregar instantaneamente

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const resolvedParams = await Promise.resolve(params);
  
  // 🚀 LIMPEZA CRUCIAL: Remove qualquer query string acidental que venha no parâmetro (ex: "16239?modelo=Unissex" vira apenas "16239")
  const rawHandle = decodeURIComponent(resolvedParams.handle || '').trim();
  const handleOrId = rawHandle.split('?')[0].split('&')[0];

  if (!handleOrId) {
    notFound();
  }

  try {
    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      console.error('❌ Credenciais do WooCommerce não configuradas no servidor.');
      notFound();
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    let product = null;
    const isNumeric = /^\d+$/.test(handleOrId);
    
    // 1️⃣ Busca otimizada do produto principal pelo ID limpo ou pelo Slug
    if (isNumeric) {
      const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${handleOrId}`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 300 },
      });
      if (res.ok) product = await res.json();
    } else {
      const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?slug=${handleOrId}&status=publish`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const list = await res.json();
        if (list.length > 0) product = list[0];
      }
    }

    // Se falhar na busca direta, tenta varrer os primeiros produtos publicados para achar correspondência
    if (!product) {
      const resAll = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=50&status=publish`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 300 },
      });
      if (resAll.ok) {
        const allProducts = await resAll.json();
        product = allProducts.find((p: any) => String(p.id) === handleOrId || p.slug === handleOrId);
      }
    }

    if (!product) {
      notFound();
    }

    // 2️⃣ Busca de variações de forma segura e isolada
    let variations = [];
    if (product.type === 'variable') {
      try {
        const resVariations = await fetch(`${wcUrl}/wp-json/wc/v3/products/${product.id}/variations?per_page=50`, {
          headers: { 'Authorization': authHeader },
          next: { revalidate: 300 },
        });
        if (resVariations.ok) {
          variations = await resVariations.json();
        }
      } catch (err) {
        console.error('⚠️ Aviso: Falha ao carregar variações, usando padrão.', err);
      }
    }

    // 3️⃣ Formatação blindada do produto para o componente cliente
    const productFormatado = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      type: product.type,
      price: Number(product.price || product.regular_price || 149.90),
      regular_price: Number(product.regular_price || product.price || 149.90),
      description: product.description || '',
      short_description: product.short_description || '',
      images: product.images ? product.images.map((img: any) => img.src) : [product.images?.[0]?.src || ''],
      image: product.images?.[0]?.src || '',
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
          image: v.image?.src || product.images?.[0]?.src || null,
          attributes: v.attributes ? v.attributes.map((attr: any) => ({
            name: attr.name,
            option: attr.option
          })) : []
        };
      }) : [
        { id: product.id, model: 'Unissex', size: 'Único', stock: 10, price: Number(product.price || 149.90), image: product.images?.[0]?.src || '' }
      ]
    };

    return <ProductClient product={productFormatado} />;

  } catch (error) {
    console.error('❌ Erro fatal ao carregar produto do WooCommerce na página:', error);
    notFound();
  }
}