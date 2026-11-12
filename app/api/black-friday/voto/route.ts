// Voto do "Duelo" da Black Friday (Beija-Flor × Viradouro). Só conta: não guarda dados pessoais.
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { chaveVoto, EscolaDuelo, placarDuelo } from '../../../../lib/blackfriday';
import { dentroDoLimite, ipDe, kvIncr } from '../../../../lib/automacao/kv';

export const dynamic = 'force-dynamic';

const ESCOLAS: EscolaDuelo[] = ['beija-flor', 'viradouro'];
const COOKIE = 'sv_bf_voto';

export async function GET() {
  return NextResponse.json(await placarDuelo(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let escola: EscolaDuelo | undefined;
  try {
    const corpo = await request.json();
    escola = ESCOLAS.find((e) => e === corpo?.escola);
  } catch {
    // corpo inválido
  }
  if (!escola) return NextResponse.json({ ok: false, error: 'escola inválida' }, { status: 400 });

  const jaVotou = (request.headers.get('cookie') || '').includes(`${COOKIE}=`);
  const ip = crypto.createHash('sha256').update(ipDe(request)).digest('hex').slice(0, 24);
  // 1 voto por navegador e no máximo 5 por rede por dia (casa com vários celulares no mesmo Wi-Fi)
  if (jaVotou || !(await dentroDoLimite(`bf-voto:${ip}`, 5, 86_400))) {
    return NextResponse.json({ ok: false, jaVotou: true, placar: await placarDuelo() });
  }
  await kvIncr(chaveVoto(escola));
  const res = NextResponse.json({ ok: true, placar: await placarDuelo() });
  res.cookies.set(COOKIE, escola, { maxAge: 60 * 60 * 24 * 30, httpOnly: false, sameSite: 'lax', path: '/' });
  return res;
}
