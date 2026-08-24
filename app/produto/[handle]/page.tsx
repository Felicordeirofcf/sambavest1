// app/produto/[handle]/page.tsx
import ProductClient from './ProductClient';
import { notFound } from 'next/navigation';

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const resolvedParams = await Promise.resolve(params);
  const productId = decodeURIComponent(resolvedParams.handle).trim();

  try {
    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      console.error('❌ Credenciais do WooCommerce não configuradas no servidor.');
      notFound();
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // 1️⃣ Busca o produto principal no WooCommerce
    const resProduct = await fetch(`${wcUrl}/wp-json/wc/v3/products/${productId}`, {
      headers: { 'Authorization': authHeader },
      cache: 'no-store',
    });

    if (!resProduct.ok) {
      notFound();
    }

    const product = await resProduct.json();

    // 2️⃣ Se for um produto variável, busca todas as variações (Modelos, Tamanhos e IDs exatos)
    let variations = [];
    if (product.type === 'variable') {
      const resVariations = await fetch(`${wcUrl}/wp-json/wc/v3/products/${productId}/variations?per_page=100`, {
        headers: { 'Authorization': authHeader },
        cache: 'no-store',
      });
      if (resVariations.ok) {
        variations = await resVariations.json();
      }
    }

    // 3️⃣ Formata o produto unificado para entregar ao seu ProductClient com dados reais de estoque
    const productFormatado = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      type: product.type, // 'simple' ou 'variable'
      price: Number(product.price || product.regular_price || 0),
      regular_price: Number(product.regular_price || 0),
      description: product.description,
      short_description: product.short_description,
      images: product.images.map((img: any) => img.src),
      image: product.images?.[0]?.src || '',
      attributes: product.attributes.map((attr: any) => ({
        id: attr.id,
        name: attr.name,       // Ex: 'Modelo', 'Tamanho'
        options: attr.options, // Ex: ['Regata', 'Baby Look'], ['P', 'M', 'G']
      })),
      // Mapeia as variações com os IDs exatos e o estoque real do WooCommerce
      variants: variations.map((v: any) => ({
        id: v.id,                    // 🎯 ID DA VARIAÇÃO EXATA NO WOOCOMMERCE
        parent_id: product.id,       // ID Pai
        price: Number(v.price || v.regular_price || 0),
        stock: v.stock_quantity ?? (v.stock_status === 'instock' ? 999 : 0), // 📦 Estoque real
        stock_status: v.stock_status, // 'instock', 'outofstock'
        image: v.image?.src || product.images?.[0]?.src || null,
        attributes: v.attributes.map((attr: any) => ({
          name: attr.name,
          option: attr.option
        }))
      }))
    };

    return <ProductClient product={productFormatado} />;

  } catch (error) {
    console.error('❌ Erro ao carregar produto do WooCommerce na página:', error);
    notFound();
  }
}