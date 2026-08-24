// app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import { criarPedidoBling } from '@/lib/bling';

// 🚀 Força a rota a ser dinâmica, evitando qualquer cache estático no Vercel
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cliente, itens } = body;

    // Validação básica dos dados recebidos do carrinho
    if (!cliente || !itens || itens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dados do cliente ou itens do carrinho ausentes.' },
        { status: 400 }
      );
    }

    // Chama a função para registrar o pedido no ERP Bling
    const pedidoCriado = await criarPedidoBling({
      cliente: {
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
        numeroDocumento: cliente.numeroDocumento,
        endereco: cliente.endereco || 'Endereço não informado',
        numero: cliente.numero || 'S/N',
        bairro: cliente.bairro || 'Bairro não informado',
        cidade: cliente.cidade || 'Cidade não informada',
        cep: cliente.cep || '00000000',
        uf: cliente.uf || 'RJ',
      },
      itens: itens.map((item: any) => ({
        idProdutoBling: Number(item.id),
        quantidade: item.quantity,
        valorUnitario: item.price,
      })),
    });

    return NextResponse.json({
      success: true,
      message: 'Pedido gerado com sucesso no Bling!',
      pedido: pedidoCriado,
    });

  } catch (error: any) {
    console.error('❌ Erro na API de Checkout:', error);
    
    // 🛡️ Retorna sempre um JSON limpo, impedindo o erro de JSON Vazio no front-end
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Erro interno ao processar o pedido no Bling.' 
      },
      { status: 500 }
    );
  }
}