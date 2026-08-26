// app/api/produtos/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      return NextResponse.json({ success: false, error: 'Credenciais do WooCommerce não configuradas.' }, { status: 500 });
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // 🛍️ Puxa os produtos do WooCommerce (com limite e status publicados)
    const response = await fetch(`${wcUrl}/wp-json/wc/v3/products?status=publish&per_page=20`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Sempre busca dados atualizados
    });

    if (!response.ok) {
      throw new Error('Erro ao buscar produtos no WooCommerce.');
    }

    const products = await response.json();

    // Formata os dados para o seu front consumir limpo
    const produtosFormatados = products.map((prod: any) => ({
      id: prod.id,
      name: prod.name,
      slug: prod.slug,
      price: Number(prod.price || prod.regular_price || 0),
      images: prod.images.map((img: any) => img.src),
      type: prod.type, // 'simple' ou 'variable'
      description: prod.description,
    }));

    return NextResponse.json({ success: true, products: produtosFormatados });
  } catch (error: any) {
    console.error('❌ Erro ao buscar produtos:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}