// O que as pessoas fazem na página /black-friday: contadores anônimos por dia
// (sem cookie de rastreio, sem dados pessoais). Cada navegador conta cada sinal no máximo 1 vez por dia.
import { kvIncr, kvMGet } from '../automacao/kv';

export const SINAIS_BF = [
  'abriu',
  'saiu5s', // saiu em até 5 s sem rolar nem tocar em nada (toque sem querer / desinteresse imediato)
  'ficou15s',
  'ficou60s',
  'rolou50',
  'rolou90',
  'toque-topo-beija',
  'toque-topo-grio',
  'toque-card-beija',
  'toque-card-grio',
  'toque-card-retro',
  'toque-barra-beija',
  'toque-barra-grio',
  'toque-voto',
  'toque-pos-voto',
  'toque-zap',
  'toque-menu',
  'toque-logo',
  'toque-sacola',
  'toque-camisa-link',
  'toque-rodape',
  'toque-outro',
] as const;
export type SinalBF = (typeof SINAIS_BF)[number];

export const NOME_SINAL: Record<SinalBF, string> = {
  abriu: 'Abriram a página',
  saiu5s: 'Saíram em até 5 s sem rolar nem tocar',
  ficou15s: 'Ficaram 15 s ou mais',
  ficou60s: 'Ficaram 1 min ou mais',
  rolou50: 'Rolaram até a metade',
  rolou90: 'Rolaram até o fim',
  'toque-topo-beija': 'Tocaram na Beija-Flor do topo',
  'toque-topo-grio': 'Tocaram na Viradouro do topo',
  'toque-card-beija': 'Tocaram no card da Beija-Flor',
  'toque-card-grio': 'Tocaram no card da Viradouro',
  'toque-card-retro': 'Tocaram no card da Retrô',
  'toque-barra-beija': 'Tocaram na barra fixa: Beija-Flor',
  'toque-barra-grio': 'Tocaram na barra fixa: Viradouro',
  'toque-voto': 'Votaram no duelo',
  'toque-pos-voto': 'Depois de votar, tocaram em comprar a camisa da escola',
  'toque-zap': 'Tocaram no WhatsApp',
  'toque-menu': 'Abriram ou tocaram no menu (☰, Início, Nossa Loja…)',
  'toque-logo': 'Tocaram na logo',
  'toque-sacola': 'Tocaram na sacola',
  'toque-camisa-link': 'Tocaram em outro link de camisa',
  'toque-rodape': 'Tocaram no rodapé',
  'toque-outro': 'Tocaram em outro ponto',
};

export const sinalValido = (s: unknown): SinalBF | undefined => SINAIS_BF.find((x) => x === s);

const chave = (dia: string, s: SinalBF, origem?: string) => `bfc:${dia}:${s}${origem ? `:o:${origem}` : ''}`;

export async function contarSinal(dia: string, s: SinalBF, origem?: string): Promise<void> {
  await kvIncr(chave(dia, s));
  if (origem) await kvIncr(chave(dia, s, origem));
}

/** Soma de cada sinal nos dias pedidos (AAAA-MM-DD), numa consulta só. */
export async function somaSinais(dias: string[], origem?: string): Promise<Record<SinalBF, number>> {
  const chaves = dias.flatMap((d) => SINAIS_BF.map((s) => chave(d, s, origem)));
  const valores = await kvMGet<number>(chaves).catch(() => chaves.map(() => 0));
  const r = {} as Record<SinalBF, number>;
  SINAIS_BF.forEach((s) => (r[s] = 0));
  valores.forEach((v, i) => (r[SINAIS_BF[i % SINAIS_BF.length]] += Number(v) || 0));
  return r;
}
