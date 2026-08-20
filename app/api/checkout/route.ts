import { NextResponse } from 'next/server';
import { createCheckout } from '../../../lib/nuvemshop';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Carrinho vazio.' },
        { status: 400 }
      );
    }

    const normalizedItems = items.map((item: any) => {
      const variantId = Number(item.id);
      const quantity = Number(item.quantity || 1);

      if (!variantId || Number.isNaN(variantId)) {
        throw new Error(`Variant ID inválido: ${item.id}`);
      }

      if (!quantity || Number.isNaN(quantity) || quantity < 1) {
        throw new Error(`Quantidade inválida para a variante ${item.id}`);
      }

      return {
        variant_id: variantId,
        quantity,
      };
    });

    const checkout = await createCheckout(normalizedItems);

    return NextResponse.json({
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (error) {
    console.error('Erro ao criar checkout:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível criar o checkout.',
      },
      { status: 500 }
    );
  }
}