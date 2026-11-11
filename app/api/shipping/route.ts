import { NextResponse } from 'next/server';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';
import { cotarFrete } from '../../../lib/frete';

export async function POST(request: Request) {
  try {
    // Até 40 cotações a cada 10 minutos por IP: sobra para o cliente, barra robôs.
    if (!(await dentroDoLimite(`frete:${ipDe(request)}`, 40, 600))) {
      return NextResponse.json({ success: false, error: 'Muitas consultas de frete. Aguarde alguns minutos.' }, { status: 429 });
    }

    const { cep, items } = await request.json();
    const cepLimpo = String(cep || '').replace(/\D/g, '');
    if (cepLimpo.length !== 8 || !Array.isArray(items) || items.length === 0 || items.length > 20) {
      return NextResponse.json({ success: false, error: 'CEP ou carrinho inválido' }, { status: 400 });
    }
    const itens = items.map((i: { quantity?: unknown; price?: unknown }) => ({
      quantity: Math.min(20, Math.max(1, Math.floor(Number(i?.quantity) || 1))),
      price: Math.min(2000, Math.max(0, Number(i?.price) || 0)),
    }));

    const opcoesFrete = await cotarFrete(cepLimpo, itens);
    return NextResponse.json({ success: true, quotes: opcoesFrete });
  } catch (error) {
    console.error('Erro no cálculo de frete:', error);
    return NextResponse.json({ success: false, error: 'Erro ao calcular frete' }, { status: 500 });
  }
}
