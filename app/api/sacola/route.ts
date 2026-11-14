// Itens de uma "sacola pronta" (link que a IA do WhatsApp manda). GET /api/sacola?id=...
import { NextResponse } from 'next/server';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';
import { lerSacola } from '../../../lib/automacao/sacolaPronta';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await dentroDoLimite(`sacola:${ipDe(request)}`, 30, 600))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const id = new URL(request.url).searchParams.get('id') || '';
  const itens = await lerSacola(id);
  return NextResponse.json({ ok: Boolean(itens?.length), itens: itens || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
