// app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import { criarPedidoBling } from '@/lib/bling';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📦 Dados recebidos no Checkout:", JSON.stringify(body, null, 2));

    const { cliente, itens } = body;

    // Validação flexível: Se faltar itens, avisa. Se faltar cliente, criamos um genérico para não travar.
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'O carrinho está vazio ou os itens não foram enviados.' },
        { status: 400 }
      );
    }

    const clienteFinal = {
      nome: cliente?.nome || 'Cliente da Loja',
      email: cliente?.email || 'cliente@email.com',
      telefone: cliente?.telefone || '21999999999',
      numeroDocumento: cliente?.numeroDocumento || '00000000000',
      endereco: cliente?.endereco || 'Endereço não informado',
      numero: cliente?.numero || 'S/N',
      bairro: cliente?.bairro || 'Centro',
      cidade: cliente?.cidade || 'Rio de Janeiro',
      cep: cliente?.cep || '20000000',
      uf: cliente?.uf || 'RJ',
    };

    const pedidoCriado = await criarPedidoBling({
      cliente: clienteFinal,
      itens: itens.map((item: any) => ({
        idProdutoBling: Number(item.id),
        quantidade: Number(item.quantity || 1),
        valorUnitario: Number(item.price || 0),
      })),
    });

    return NextResponse.json({
      success: true,
      message: 'Pedido gerado com sucesso no Bling!',
      pedido: pedidoCriado,
    });

  } catch (error: any) {
    console.error('❌ Erro crítico na API de Checkout:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Erro interno ao processar o pedido no Bling.' 
      },
      { status: 500 }
    );
  }
}