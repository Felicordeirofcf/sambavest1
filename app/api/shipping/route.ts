// Cotação de frete no Melhor Envio (página do produto e checkout).
// Usa a mesma caixa e o mesmo peso da etiqueta (lib/automacao/melhorenvio.ts → pacote()).
import { NextResponse } from 'next/server';
import { config } from '../../../lib/automacao/config';
import { cotar } from '../../../lib/automacao/melhorenvio';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { cep, items } = await request.json();

    if (!cep || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'CEP ou carrinho vazio' }, { status: 400 });
    }

    if (!config.melhorEnvio.token || !config.melhorEnvio.remetente.cep) {
      console.error('Faltam MELHOR_ENVIO_TOKEN ou CEP_ORIGEM nas variáveis de ambiente');
      return NextResponse.json({ error: 'Erro de configuração do servidor' }, { status: 500 });
    }

    const totalItens = items.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 1), 0);
    const valorTotal = items.reduce((acc: number, item: any) => acc + Number(item.price || 0) * (Number(item.quantity) || 1), 0);

    const quotes = await cotar(String(cep), totalItens, valorTotal);
    return NextResponse.json({ success: true, quotes });
  } catch (error: any) {
    console.error('Erro no cálculo de frete:', error?.message || error);
    return NextResponse.json({ success: false, error: 'Erro ao calcular frete' }, { status: 500 });
  }
}
