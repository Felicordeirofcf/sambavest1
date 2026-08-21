// app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import { criarPedidoBling } from '../../../lib/bling';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const cliente = body?.cliente; // Dados do cliente vindo do formulário de checkout

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Carrinho vazio.' },
        { status: 400 }
      );
    }

    // Validação e normalização dos itens do carrinho
    const normalizedItems = items.map((item: any) => {
      // Como mapeamos o id do Bling para o produto, extraímos o ID base ou usamos o ID numérico
      const produtoId = Number(item.id);
      const quantity = Number(item.quantity || 1);
      const price = Number(item.price || 0);

      if (!produtoId || Number.isNaN(produtoId)) {
        throw new Error(`ID de produto inválido: ${item.id}`);
      }

      if (!quantity || Number.isNaN(quantity) || quantity < 1) {
        throw new Error(`Quantidade inválida para o item ${item.id}`);
      }

      return {
        idProdutoBling: produtoId,
        quantidade: quantity,
        valorUnitario: price,
      };
    });

    // Se o frontend ainda não estiver enviando os dados do cliente, criamos um contato padrão temporário para o Bling aceitar o pedido
    const dadosCliente = cliente || {
      nome: 'Cliente Samba Vest',
      email: 'contato@sambavest.com',
      telefone: '21999999999',
      numeroDocumento: '00000000000',
    };

    // Cria o pedido de venda diretamente no Bling
    const pedidoBling = await criarPedidoBling({
      cliente: dadosCliente,
      itens: normalizedItems,
    });

    return NextResponse.json({
      success: true,
      message: 'Pedido gerado com sucesso no Bling!',
      pedidoId: pedidoBling?.id,
    });

  } catch (error) {
    console.error('Erro ao processar checkout para o Bling:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível registrar o pedido no Bling.',
      },
      { status: 500 }
    );
  }
}