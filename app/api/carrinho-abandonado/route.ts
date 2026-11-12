// Carrinho abandonado:
//   POST  { email, nome?, telefone?, itens[], origem? } → salva a sacola de quem está no checkout
//   GET   ?recuperar=<id> → itens para remontar a sacola (link do e-mail)
//   GET   ?sair=<id>      → não recebe mais lembretes
import { NextResponse } from 'next/server';
import { itensParaRecuperar, sairDaLista, salvarAbandono } from '../../../lib/automacao/abandono';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await dentroDoLimite(`abandono:${ipDe(request)}`, 30, 3600))) return new NextResponse(null, { status: 204 });
  try {
    const corpo = await request.json();
    await salvarAbandono(corpo || {});
  } catch {
    // corpo inválido: ignora
  }
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const sair = p.get('sair');
  if (sair) {
    const ok = await sairDaLista(sair).catch(() => false);
    const msg = ok ? 'Pronto! Você não vai receber mais lembretes da sua sacola.' : 'Este link já expirou. Você não vai receber mais lembretes.';
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Samba Vest</title><body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#111"><h2>Samba Vest</h2><p>${msg}</p><p><a href="/">Voltar para a loja</a></p></body>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  const id = p.get('recuperar') || '';
  const itens = await itensParaRecuperar(id).catch(() => null);
  return NextResponse.json({ ok: Boolean(itens), itens: itens || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
