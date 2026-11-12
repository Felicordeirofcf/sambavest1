// Contador anônimo do funil (visita → produto → sacola → checkout). Não guarda dados pessoais.
import { NextResponse } from 'next/server';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';
import { contarEtapa, ETAPAS_FUNIL, EtapaFunil, origemValida } from '../../../lib/painel/funil';
import { diaLocal } from '../../../lib/painel/metricas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let etapa: EtapaFunil | undefined;
  let origem: string | undefined;
  try {
    const corpo = JSON.parse(await request.text());
    etapa = ETAPAS_FUNIL.find((e) => e === corpo?.etapa);
    origem = origemValida(corpo?.origem);
  } catch {
    // corpo inválido
  }
  if (!etapa) return new NextResponse(null, { status: 204 });
  // Robôs e recarregamentos em massa não inflam o funil
  if (!(await dentroDoLimite(`evento:${ipDe(request)}`, 60, 3600))) return new NextResponse(null, { status: 204 });
  await contarEtapa(diaLocal(Date.now()), etapa, origem).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
