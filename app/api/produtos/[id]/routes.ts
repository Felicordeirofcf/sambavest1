// app/api/produtos/[id]/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID do produto não informado.' },
        { status: 400 }
      );
    }

    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      return NextResponse.json(
        { success: false, error: 'Credenciais do WooCommerce não configuradas no servidor.' },
        { status: 500 }
      );
    }

    // 🔐 Autenticação Basic Auth para a API REST do WooCommerce
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const response = await fetch(`${wcUrl}/wp-json/wc/v3/products/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const product = await response.json();

    if (!response.ok) {
      console.error('❌ Erro ao buscar produto no WooCommerce:', product);
      return NextResponse.json(
        { success: false, error: product.message || 'Produto não encontrado no WooCommerce.' },
        { status: response.status }
      );
    }

    // 🎨 Formata o produto para o seu front-end usar com facilidade
    const produtoFormatado = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      permalink: product.permalink,
      type: product.type, // 'simple' ou 'variable'
      price: Number(product.price || product.regular_price || 0),
      regular_price: Number(product.regular_price || 0),
      sale_price: Number(product.sale_price || 0),
      description: product.description,
      short_description: product.short_description,
      images: product.images.map((img: any) => img.src),
      attributes: product.attributes.map((attr: any) => ({
        id: attr.id,
        name: attr.name,       // Ex: 'Modelo', 'Tamanho'
        options: attr.options, // Ex: ['Regata', 'Baby Look'], ['P', 'M', 'G']
      })),
    };

    return NextResponse.json({
      success: true,
      product: produtoFormatado,
    });

  } catch (error: any) {
    console.error('❌ Erro crítico ao buscar produto:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno ao buscar produto.' },
      { status: 500 }
    );
  }
}