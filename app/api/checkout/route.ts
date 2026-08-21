// Substitua tudo no seu arquivo por este código:

import { NextResponse } from 'next/server';
import { criarPedidoBling } from '@/lib/bling'; // Certifique-se de usar o atalho @/

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cliente, itens } = body;

    // Validação básica
    if (!cliente || !itens || itens.length === 0) {
      return NextResponse.json(
        { error: 'Dados do cliente ou itens do carrinho ausentes.' },
        { status: 400 }
      );
    }

    // Chama a função que criamos no bling.ts para registrar o pedido no ERP
    const pedidoCriado = await criarPedidoBling({
      cliente: {
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
        numeroDocumento: cliente.numeroDocumento,
        // 👇 ADICIONANDO OS CAMPOS QUE O TYPESCRIPT EXIGIU 👇
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
    console.error('Erro na API de Checkout:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno ao processar o pedido.' },
      { status: 500 }
    );
  }
}