// Pix dentro do site: POST gera (uma vez só) e devolve o código; GET só consulta a situação.
import { NextResponse } from 'next/server';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';
import { gerarPix, situacaoPix } from '../../../lib/pagamento/pix';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const semCache = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  // Limite por pedido (quem recarrega a página não trava os outros) e um teto largo por IP: muitos
  // celulares dividem o mesmo IP na operadora.
  const pedidoId = String(Number(corpo?.pedido) || 0);
  if (!(await dentroDoLimite(`pix:p:${pedidoId}`, 10, 600)) || !(await dentroDoLimite(`pix:ip:${ipDe(request)}`, 120, 600))) {
    return NextResponse.json({ ok: false, motivo: 'muitas tentativas' }, { status: 429, headers: semCache });
  }
  const r = await gerarPix(Number(corpo?.pedido), String(corpo?.chave || ''));
  // Chave errada: sem dados do pedido
  return NextResponse.json(r, { status: r.ok || r.fallback ? 200 : 404, headers: semCache });
}

export async function GET(request: Request) {
  if (!(await dentroDoLimite(`pixstatus:${ipDe(request)}`, 240, 600))) {
    return NextResponse.json({ ok: false, motivo: 'muitas consultas' }, { status: 429, headers: semCache });
  }
  const q = new URL(request.url).searchParams;
  const r = await situacaoPix(Number(q.get('pedido')), String(q.get('k') || ''));
  return NextResponse.json(r, { status: r.ok ? 200 : 404, headers: semCache });
}
