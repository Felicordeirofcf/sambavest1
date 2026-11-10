import { NextResponse } from 'next/server';
import { cotarFrete } from '../../../lib/frete';

export async function POST(request: Request) {
  try {
    const { cep, items } = await request.json();

    if (!cep || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'CEP ou carrinho vazio' }, { status: 400 });
    }

    const opcoesFrete = await cotarFrete(cep, items);
    return NextResponse.json({ success: true, quotes: opcoesFrete });
  } catch (error: any) {
    console.error('Erro no cálculo de frete:', error);
    return NextResponse.json({ success: false, error: 'Erro ao calcular frete' }, { status: 500 });
  }
}
