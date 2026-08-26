import ProductClient from './ProductClient';
import { notFound } from 'next/navigation';

export const revalidate = 60; // 🚀 Cache inteligente para carregar instantaneamente

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const resolvedParams = await Promise.resolve(params);
  const handleOrId = decodeURIComponent(resolvedParams.handle).trim();

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

    // 1️⃣ Tenta buscar pelo ID (se o parâmetro for numérico) ou pelo Slug (se for texto)
    const isNumeric = /^\d+$/.test(handleOrId);
    
    if (isNumeric) {
      const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${handleOrId}`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 60 },
      });
      if (res.ok) product = await res.json();
    } else {
      // Se for texto (slug), busca na listagem filtrando pelo slug
      const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?slug=${handleOrId}&status=publish`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 60 },
      });
      if (res.ok) {
        const list = await res.json();
        if (list.length > 0) product = list[0];
      }
    }

    // Se ainda não achou, tenta buscar por ID geral caso venha mascarado
    if (!product && !isNumeric) {
      const resAll = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=50&status=publish`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 60 },
      });
      if (resAll.ok) {
        const allProducts = await resAll.json();
        product = allProducts.find((p: any) => String(p.id) === handleOrId || p.slug === handleOrId);
      }
    }

    if (!product) {
      notFound();
    }

    // 2️⃣ Busca as variações do produto encontrado
    let variations = [];
    if (product.type === 'variable') {
      const resVariations = await fetch(`${wcUrl}/wp-json/wc/v3/products/${product.id}/variations?per_page=100`, {
        headers: { 'Authorization': authHeader },
        next: { revalidate: 60 },
      });
      if (resVariations.ok) {
        variations = await resVariations.json();
      }
    }

    // 3️⃣ Formata o produto unificado para a tela
    const productFormatado = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      type: product.type,
      price: Number(product.price || product.regular_price || 0),
      regular_price: Number(product.regular_price || 0),
      description: product.description,
      short_description: product.short_description,
      images: product.images ? product.images.map((img: any) => img.src) : [],
      image: product.images?.[0]?.src || '',
      categories: product.categories?.map((cat: any) => cat.slug) || [],
      attributes: product.attributes ? product.attributes.map((attr: any) => ({
        id: attr.id,
        name: attr.name,
        options: attr.options,
      })) : [],
      variants: variations.map((v: any) => {
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
          model: modeloAttr?.option || 'Geral',
          size: tamanhoAttr?.option || 'Único',
          price: Number(v.price || v.regular_price || product.price || 0),
          stock: v.stock_quantity ?? (v.stock_status === 'instock' ? 999 : 0),
          stock_status: v.stock_status,
          image: v.image?.src || product.images?.[0]?.src || null,
          attributes: v.attributes ? v.attributes.map((attr: any) => ({
            name: attr.name,
            option: attr.option
          })) : []
        };
      })
    };

    return <ProductClient product={productFormatado} />;

  } catch (error) {
    console.error('❌ Erro ao carregar produto do WooCommerce na página:', error);
    notFound();
  }
}