// app/api/produtos/[id]/variations/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // 🎯 Tipagem atualizada para o Next.js moderno (Promise)
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID do produto pai não informado.' },
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

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // 🔍 Puxa as variações cadastradas do produto pai no WooCommerce
    const response = await fetch(`${wcUrl}/wp-json/wc/v3/products/${id}/variations?per_page=50`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const variations = await response.json();

    if (!response.ok) {
      console.error('❌ Erro ao buscar variações no WooCommerce:', variations);
      throw new Error(variations.message || 'Erro ao buscar variações do produto.');
    }

    // Formata as variações (trazendo o ID exato, preço, imagem se houver e atributos como Modelo/Tamanho)
    const variacoesFormatadas = variations.map((v: any) => ({
      id: v.id,                       // 🎯 ID EXATO DA VARIAÇÃO PARA O CARRINHO E PEDIDO!
      parent_id: Number(id),          // ID do produto pai
      price: Number(v.price || v.regular_price || 0),
      regular_price: Number(v.regular_price || 0),
      sale_price: Number(v.sale_price || 0),
      stock_status: v.stock_status,   // 'instock', 'outofstock'
      image: v.image?.src || null,
      attributes: v.attributes.map((attr: any) => ({
        name: attr.name,              // Ex: 'Modelo' ou 'Tamanho'
        option: attr.option           // Ex: 'Regata' ou 'G'
      }))
    }));

    return NextResponse.json({ 
      success: true, 
      variations: variacoesFormatadas 
    });

  } catch (error: any) {
    console.error('❌ Erro crítico ao buscar variações:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno ao buscar variações.' }, 
      { status: 500 }
    );
  }
}