// Relatórios dos anúncios da Meta (Marketing API, somente leitura).
// Precisa de META_ADS_TOKEN: token de um usuário do sistema do portfólio com permissão "ads_read"
// na conta de anúncios (META_AD_ACCOUNT_ID, padrão 315563831612360).
import { config } from './config';
import { kvGet, kvSet } from './kv';

const CACHE_S = 300; // 5 min: os números da Meta mudam devagar e a API tem limite de chamadas

async function graph<T>(caminho: string, params: Record<string, string> = {}): Promise<T> {
  const { token, versao } = config.metaAds;
  if (!token) throw new Error('META_ADS_TOKEN não configurado');
  // META_GRAPH_URL só para testes locais
  const url = new URL(`${process.env.META_GRAPH_URL || 'https://graph.facebook.com'}/${versao}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  const j = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
  if (!res.ok || j?.error) {
    const msg = j?.error?.message || `HTTP ${res.status}`;
    const codigo = j?.error?.code;
    const erro = new Error(codigo === 190 ? `token da Meta inválido ou vencido (${msg})` : `Meta: ${msg}`) as Error & { codigo?: number };
    erro.codigo = codigo;
    throw erro;
  }
  return j as T;
}

async function comCache<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const k = `metaads:${chave}`;
  const salvo = await kvGet<T>(k).catch(() => null);
  if (salvo) return salvo;
  const v = await fn();
  await kvSet(k, v, CACHE_S).catch(() => undefined);
  return v;
}

const conta = () => `act_${config.metaAds.conta}`;

/** Erro de permissão da Meta (#10, #200-#299). */
const semPermissao = (e: unknown) => {
  const c = (e as { codigo?: number }).codigo;
  return c === 10 || (typeof c === 'number' && c >= 200 && c < 300);
};

// ---------- Tipos ----------

type Acao = { action_type: string; value: string };
type LinhaInsight = {
  date_start?: string;
  ad_id?: string;
  ad_name?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  clicks?: string;
  actions?: Acao[];
};

export type Numeros = {
  gasto: number;
  impressoes: number;
  alcance: number;
  frequencia: number;
  cliquesLink: number;
  cliques: number;
  visualizacoesPagina: number;
  verConteudo: number;
  sacola: number;
  checkout: number;
  compras: number;
};

const n = (v?: string) => Number(v) || 0;
function acao(lista: Acao[] | undefined, ...tipos: string[]): number {
  for (const t of tipos) {
    const a = lista?.find((x) => x.action_type === t);
    if (a) return n(a.value);
  }
  return 0;
}

function numeros(l: LinhaInsight | undefined): Numeros {
  const a = l?.actions;
  return {
    gasto: n(l?.spend),
    impressoes: n(l?.impressions),
    alcance: n(l?.reach),
    frequencia: n(l?.frequency),
    cliquesLink: n(l?.inline_link_clicks),
    cliques: n(l?.clicks),
    visualizacoesPagina: acao(a, 'landing_page_view'),
    verConteudo: acao(a, 'offsite_conversion.fb_pixel_view_content', 'view_content'),
    sacola: acao(a, 'offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart'),
    checkout: acao(a, 'offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout'),
    compras: acao(a, 'offsite_conversion.fb_pixel_purchase', 'purchase'),
  };
}

const CAMPOS = 'spend,impressions,reach,frequency,inline_link_clicks,clicks,actions';

export type Periodo = { desde: string; ate: string }; // AAAA-MM-DD

const intervalo = (p: Periodo) => JSON.stringify({ since: p.desde, until: p.ate });

// ---------- Consultas ----------

export type ContaAnuncios = {
  nome: string;
  status: number; // 1 = ativa
  motivoBloqueio?: number;
  gastoTotal: number;
  limite: number | null;
  saldo?: string; // texto da Meta, ex.: "Saldo disponível (R$ 170,01 BRL)"
};

export async function contaAnuncios(): Promise<ContaAnuncios> {
  return comCache('conta', async () => {
    const r = await graph<{
      name: string;
      account_status: number;
      disable_reason?: number;
      amount_spent?: string;
      spend_cap?: string;
      funding_source_details?: { display_string?: string };
    }>(conta(), { fields: 'name,account_status,disable_reason,amount_spent,spend_cap,funding_source_details' }).catch((e) =>
      // O saldo (funding_source_details) pode exigir mais que "só leitura": tenta sem ele
      semPermissao(e) ? graph<{ name: string; account_status: number; disable_reason?: number; amount_spent?: string; spend_cap?: string; funding_source_details?: { display_string?: string } }>(conta(), { fields: 'name,account_status,disable_reason,amount_spent,spend_cap' }) : Promise.reject(e)
    );
    return {
      nome: r.name,
      status: r.account_status,
      motivoBloqueio: r.disable_reason || undefined,
      gastoTotal: n(r.amount_spent) / 100,
      limite: r.spend_cap && r.spend_cap !== '0' ? n(r.spend_cap) / 100 : null,
      saldo: r.funding_source_details?.display_string,
    };
  });
}

export async function totais(p: Periodo): Promise<Numeros> {
  return comCache(`total:${p.desde}:${p.ate}`, async () => {
    const r = await graph<{ data: LinhaInsight[] }>(`${conta()}/insights`, { level: 'account', fields: CAMPOS, time_range: intervalo(p) });
    return numeros(r.data[0]);
  });
}

export async function porDia(p: Periodo): Promise<(Numeros & { dia: string })[]> {
  return comCache(`dia:${p.desde}:${p.ate}`, async () => {
    const r = await graph<{ data: LinhaInsight[] }>(`${conta()}/insights`, {
      level: 'account',
      fields: CAMPOS,
      time_range: intervalo(p),
      time_increment: '1',
      limit: '100',
    });
    return r.data.map((l) => ({ dia: l.date_start || '', ...numeros(l) }));
  });
}

export type Anuncio = Numeros & {
  id: string;
  nome: string;
  campanha: string;
  status: string; // effective_status da Meta
  /** Chave do anúncio no Gerenciador (ACTIVE = ligado, PAUSED = desligado), independente da análise. */
  chave?: string;
  motivoReprovacao?: string;
  miniatura?: string;
  criadoEm: number; // ms
};

export async function anuncios(p: Periodo): Promise<Anuncio[]> {
  return comCache(`ads:${p.desde}:${p.ate}`, async () => {
    const pedirLista = (camposAds: string) =>
      graph<{
        data: {
          id: string;
          name: string;
          effective_status: string;
          status?: string;
          created_time?: string;
          campaign?: { name?: string };
          creative?: { thumbnail_url?: string };
          ad_review_feedback?: { global?: Record<string, string> };
        }[];
      }>(`${conta()}/ads`, {
        fields: camposAds,
        effective_status: JSON.stringify(['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'WITH_ISSUES', 'IN_PROCESS', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PREAPPROVED']),
        limit: '50',
      });
    const [lista, ins] = await Promise.all([
      // Miniatura e motivo de reprovação podem exigir mais que "só leitura": tenta sem eles
      pedirLista('name,status,effective_status,created_time,campaign{name},creative{thumbnail_url},ad_review_feedback').catch((e) =>
        semPermissao(e) ? pedirLista('name,status,effective_status,created_time,campaign{name}') : Promise.reject(e)
      ),
      graph<{ data: LinhaInsight[] }>(`${conta()}/insights`, {
        level: 'ad',
        fields: `ad_id,ad_name,campaign_name,${CAMPOS}`,
        time_range: intervalo(p),
        limit: '100',
      }),
    ]);
    const porId = new Map(ins.data.map((l) => [l.ad_id, l]));
    return lista.data
      .map((a) => ({
        id: a.id,
        nome: a.name,
        campanha: a.campaign?.name || '',
        status: a.effective_status,
        chave: a.status,
        motivoReprovacao: a.ad_review_feedback?.global ? Object.values(a.ad_review_feedback.global).join(' ') : undefined,
        miniatura: a.creative?.thumbnail_url,
        criadoEm: a.created_time ? Date.parse(a.created_time) : 0,
        ...numeros(porId.get(a.id)),
      }))
      // Mais recentes primeiro
      .sort((x, y) => y.criadoEm - x.criadoEm || y.gasto - x.gasto);
  });
}

export const NOME_STATUS: Record<string, { rotulo: string; tom: 'ok' | 'atencao' | 'erro' | 'off' }> = {
  ACTIVE: { rotulo: 'Ativo', tom: 'ok' },
  PENDING_REVIEW: { rotulo: 'Em análise', tom: 'atencao' },
  IN_PROCESS: { rotulo: 'Processando', tom: 'atencao' },
  PREAPPROVED: { rotulo: 'Pré-aprovado', tom: 'atencao' },
  WITH_ISSUES: { rotulo: 'Com problema', tom: 'erro' },
  DISAPPROVED: { rotulo: 'Reprovado', tom: 'erro' },
  PAUSED: { rotulo: 'Pausado', tom: 'off' },
  CAMPAIGN_PAUSED: { rotulo: 'Campanha pausada', tom: 'off' },
  ADSET_PAUSED: { rotulo: 'Conjunto pausado', tom: 'off' },
};

export const STATUS_CONTA: Record<number, string> = {
  1: 'Ativa',
  2: 'Desativada',
  3: 'Pagamento pendente',
  7: 'Em análise de risco',
  8: 'Aguardando acerto',
  9: 'Em período de carência',
  100: 'Encerramento pendente',
  101: 'Encerrada',
};

// ---------- Entrega dos anúncios (a Meta está mostrando? o saldo dá para hoje?) ----------

export type EntregaAnuncios = {
  /** Conjuntos ligados e o que a Meta diz sobre eles (aprendizado, problemas). */
  conjuntos: { nome: string; status: string; aprendizado?: string; problemas?: string[] }[];
  /** Exibições por hora hoje (hora local da conta, 0–23). */
  porHora: { hora: number; impressoes: number }[];
  /** Horas seguidas, até agora, sem nenhuma exibição (com anúncio ligado). */
  horasSemEntrega: number;
  /** Saldo pré-pago em R$ (texto da Meta convertido) e orçamento diário somado dos conjuntos ligados. */
  saldo: number | null;
  orcamentoDia: number | null;
  /** Situação para o dono: ok | atencao | parado */
  situacao: 'ok' | 'atencao' | 'parado';
  motivos: string[];
};

type ConjuntoApi = {
  name: string;
  effective_status: string;
  daily_budget?: string;
  learning_stage_info?: { status?: string };
  issues_info?: { error_summary?: string; error_message?: string }[];
};

/** Lê o saldo do texto da Meta, ex.: "Saldo disponível (R$ 134,01 BRL)" → 134.01 */
export function saldoDoTexto(t?: string): number | null {
  const m = (t || '').match(/R\$\s*([\d.]+,\d{2})/);
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
}

export async function entregaAnuncios(hoje: string, horaAgora: number): Promise<EntregaAnuncios> {
  const pedirConjuntos = (campos: string) =>
    graph<{ data: ConjuntoApi[] }>(`${conta()}/adsets`, {
      fields: campos,
      effective_status: JSON.stringify(['ACTIVE', 'PENDING_REVIEW', 'WITH_ISSUES', 'IN_PROCESS', 'PREAPPROVED']),
      limit: '50',
    });
  const [conjuntosApi, horas, contaInfo] = await Promise.all([
    // learning_stage_info / issues_info podem exigir mais permissão: tenta sem eles
    pedirConjuntos('name,effective_status,daily_budget,learning_stage_info,issues_info').catch((e) =>
      semPermissao(e) ? pedirConjuntos('name,effective_status,daily_budget') : Promise.reject(e)
    ),
    graph<{ data: { impressions?: string; hourly_stats_aggregated_by_advertiser_time_zone?: string }[] }>(`${conta()}/insights`, {
      level: 'account',
      fields: 'impressions',
      time_range: intervalo({ desde: hoje, ate: hoje }),
      breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
      limit: '48',
    }).catch(() => ({ data: [] })),
    contaAnuncios().catch(() => null),
  ]);

  const porHora = horas.data
    .map((l) => ({ hora: Number((l.hourly_stats_aggregated_by_advertiser_time_zone || '').slice(0, 2)), impressoes: n(l.impressions) }))
    .filter((x) => Number.isFinite(x.hora))
    .sort((a, b) => a.hora - b.hora);
  const ligados = conjuntosApi.data.filter((c) => c.effective_status === 'ACTIVE');
  // Horas completas sem exibição, contando de trás para frente a partir da hora anterior à atual
  // (a hora atual ainda está em andamento e a Meta atrasa os números em até ~30 min)
  let horasSemEntrega = 0;
  if (ligados.length) {
    for (let h = horaAgora - 1; h >= 0; h--) {
      if ((porHora.find((x) => x.hora === h)?.impressoes || 0) > 0) break;
      horasSemEntrega++;
    }
    if (!porHora.some((x) => x.impressoes > 0)) horasSemEntrega = horaAgora; // nada hoje ainda
  }
  const orcamentoDia = ligados.length ? ligados.reduce((s, c) => s + n(c.daily_budget) / 100, 0) || null : null;
  const saldo = saldoDoTexto(contaInfo?.saldo);

  const motivos: string[] = [];
  let situacao: EntregaAnuncios['situacao'] = 'ok';
  if (contaInfo && contaInfo.status !== 1) {
    situacao = 'parado';
    motivos.push('conta de anúncios não está ativa');
  }
  if (!ligados.length) {
    situacao = 'parado';
    motivos.push('nenhum conjunto de anúncios ligado e entregando');
  }
  // De madrugada a Meta entrega pouco: só acusa "parado" a partir das 9h
  if (ligados.length && horaAgora >= 9 && horasSemEntrega >= 2) {
    situacao = 'parado';
    motivos.push(`${horasSemEntrega} h seguidas sem nenhuma exibição`);
  }
  if (saldo !== null && orcamentoDia && saldo < orcamentoDia) {
    situacao = 'parado';
    motivos.push('saldo pré-pago menor que 1 dia de orçamento');
  } else if (saldo !== null && orcamentoDia && saldo < orcamentoDia * 2) {
    if (situacao === 'ok') situacao = 'atencao';
    motivos.push('saldo pré-pago para menos de 2 dias');
  }
  const conjuntos = conjuntosApi.data.map((c) => ({
    nome: c.name,
    status: c.effective_status,
    aprendizado: c.learning_stage_info?.status,
    problemas: c.issues_info?.map((i) => i.error_summary || i.error_message || '').filter(Boolean),
  }));
  for (const c of conjuntos) {
    if (c.problemas?.length) {
      if (situacao === 'ok') situacao = 'atencao';
      motivos.push(`problema no conjunto "${c.nome}": ${c.problemas.join('; ')}`);
    }
    if (c.aprendizado === 'FAIL') {
      if (situacao === 'ok') situacao = 'atencao';
      motivos.push(`conjunto "${c.nome}" com aprendizado limitado`);
    }
  }
  return { conjuntos, porHora, horasSemEntrega, saldo, orcamentoDia, situacao, motivos };
}
