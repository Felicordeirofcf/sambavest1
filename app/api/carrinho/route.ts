// Preço atual dos itens da sacola (o navegador guarda o preço de quando o item foi adicionado).
// O checkout chama esta rota para mostrar o mesmo total que o servidor vai cobrar.
import { NextResponse } from 'next/server';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';

export const dynamic = 'force-dynamic';

type ProdutoWc = { id: number; price: string; regular_price?: string; status: string; purchasable: boolean; stock_status: string };

export async function POST(request: Request) {
  if (!(await dentroDoLimite(`carrinho:${ipDe(request)}`, 60, 600))) {
    return NextResponse.json({ success: false, error: 'Muitas consultas.' }, { status: 429 });
  }
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) return NextResponse.json({ success: false }, { status: 500 });

  let ids: number[] = [];
  try {
    const body = await request.json();
    const brutos: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
    ids = [...new Set(brutos.map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
  } catch {
    // corpo inválido
  }
  if (ids.length === 0) return NextResponse.json({ success: true, itens: {} });

  const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
  const auth = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const itens: Record<string, { preco: number; precoCheio: number; disponivel: boolean }> = {};
  await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${id}`, { headers: { Authorization: auth }, next: { revalidate: 30 } });
      if (res.status === 404) {
        itens[id] = { preco: 0, precoCheio: 0, disponivel: false };
        return;
      }
      if (!res.ok) return; // falha temporária: o checkout mantém o preço que tem
      const p = (await res.json()) as ProdutoWc;
      const preco = Number(p.price) || 0;
      itens[id] = {
        preco,
        precoCheio: Number(p.regular_price) || preco,
        disponivel: p.status === 'publish' && p.purchasable && p.stock_status !== 'outofstock' && preco > 0,
      };
    })
  );
  return NextResponse.json({ success: true, itens });
}
