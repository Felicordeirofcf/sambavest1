// Contador anônimo do funil (visita → produto → sacola → checkout). Não guarda dados pessoais.
import { NextResponse } from 'next/server';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';
import { contarEtapa, ETAPAS_FUNIL, EtapaFunil, origemValida } from '../../../lib/painel/funil';
import { diaLocal } from '../../../lib/painel/metricas';
import { contarSinal, sinalValido, type SinalBF } from '../../../lib/painel/comportamentoBF';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let etapa: EtapaFunil | undefined;
  let origem: string | undefined;
  let sinal: SinalBF | undefined;
  try {
    const corpo = JSON.parse(await request.text());
    etapa = ETAPAS_FUNIL.find((e) => e === corpo?.etapa);
    sinal = sinalValido(corpo?.bf);
    origem = origemValida(corpo?.origem);
  } catch {
    // corpo inválido
  }
  if (!etapa && !sinal) return new NextResponse(null, { status: 204 });
  // Robôs e recarregamentos em massa não inflam o funil
  if (!(await dentroDoLimite(`evento:${ipDe(request)}`, 60, 3600))) return new NextResponse(null, { status: 204 });
  if (etapa) await contarEtapa(diaLocal(Date.now()), etapa, origem).catch(() => undefined);
  if (sinal) await contarSinal(diaLocal(Date.now()), sinal, origem).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
