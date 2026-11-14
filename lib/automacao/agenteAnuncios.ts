// Agente de anúncios com IA: lê os números da Meta e do site, escreve a análise em português
// simples e sugere o que fazer (pausar, escalar, trocar arte...). Ele SÓ SUGERE: quem aprova e
// executa no Gerenciador é o dono. O token da Meta é de leitura; o agente não mexe em nada.
//
// Como funciona (para estudar):
//  1. Coleta (código comum): busca os números da Meta (conta, por dia, por anúncio), o funil do
//     site de quem veio do anúncio, as vendas pagas e as regras fixas que já existiam.
//  2. Contexto: tudo vira um JSON pequeno, só com números agregados (nenhum dado de cliente).
//  3. Modelo: o Claude recebe as instruções (papel, regras de cuidado) + o JSON e devolve uma
//     resposta no formato exato de um schema (structured outputs): resumo, sugestões, o que vigiar.
//     Por isso a tela não precisa "adivinhar" o texto: cada sugestão vem com campos fixos.
//  4. Humano no circuito: as sugestões aparecem no painel com "Fiz" / "Ignorar".
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { PERIODO_BF } from '../blackfridayPeriodo';
import { quando, ultimosDias } from '../painel/analytics';
import { somaSinais } from '../painel/comportamentoBF';
import { pedidosRecentes } from '../painel/dados';
import { somaFunil } from '../painel/funil';
import { diaLocal, pago } from '../painel/metricas';
import { config } from './config';
import { kvGet, kvSet } from './kv';
import { lerMelhorias } from './melhorias';
import { anuncios, contaAnuncios, porDia, type Anuncio } from './metaAds';

const CHAVE = 'anuncios:analise-ia';
const CHAVE_DECISOES = 'anuncios:analise-ia:decisoes';
/** A análise automática roda 1x por dia, a partir desta hora (o botão no painel roda na hora). */
export const HORA_ANALISE_DIARIA = 9;
const INICIO_CAMPANHA = '2026-11-12';

// ---------- Formato da resposta (o modelo é obrigado a seguir) ----------

const Sugestao = z.object({
  id: z.string().describe('identificador curto em kebab-case, estável entre análises (ex.: "pausar-story", "escalar-carrossel")'),
  tipo: z.enum(['pausar', 'escalar', 'reduzir', 'trocar_arte', 'ajustar_publico', 'ajustar_site', 'manter', 'outro']),
  anuncio: z.string().nullable().describe('nome exato do anúncio, ou null se for da conta/site'),
  titulo: z.string().describe('a ação em uma frase curta, no imperativo'),
  porque: z.string().describe('o motivo, citando os números que sustentam a sugestão'),
  como: z.string().describe('passo a passo curto de como fazer no Gerenciador de Anúncios ou no site'),
  impacto: z.enum(['alto', 'medio', 'baixo']),
  confianca: z.enum(['alta', 'media', 'baixa']).describe('baixa quando há poucos dados (poucos cliques ou vendas)'),
});

const Analise = z.object({
  situacao: z.enum(['bom', 'atencao', 'ruim']),
  resumo: z.string().describe('2 a 4 frases: como está a campanha, em português simples'),
  destaques: z.array(z.string()).describe('até 4 fatos importantes com números'),
  sugestoes: z.array(Sugestao).describe('até 5, da mais importante para a menos'),
  vigiar: z.array(z.string()).describe('até 3 coisas para observar nas próximas 24 h'),
});
export type AnaliseIA = z.infer<typeof Analise>;
export type SugestaoIA = z.infer<typeof Sugestao>;

export type AnaliseSalva = {
  em: number;
  modelo: string;
  analise: AnaliseIA;
  tokens: { entrada: number; saida: number };
};

// ---------- Instruções ----------

const SISTEMA = `Você é o analista de tráfego pago da Samba Vest, uma loja online pequena de camisas de escolas de samba do Rio (Viradouro, Beija-Flor etc.), vendidas pelo site. Os anúncios rodam no Facebook e Instagram (Meta) e levam para o site. Agora é a campanha de Black Friday, que vai até 30/11.

Seu trabalho: ler os números que vou te passar, explicar ao dono em português simples o que está acontecendo e sugerir o que fazer. O dono não é especialista: quando usar um termo técnico (CTR, CPC, frequência, ROAS), explique em poucas palavras.

Regras:
- Use só os números fornecidos. Não invente dados, públicos, concorrentes nem resultados.
- Cite os números que sustentam cada sugestão (ex.: "R$ 18 gastos e 0 vendas em 3 dias").
- Amostras pequenas enganam: com menos de ~300 impressões, ~20 cliques ou poucas vendas, diga que é cedo e use confiança "baixa". Prefira "esperar mais um dia" a mexer no escuro.
- Uma campanha recém-ligada ou recém-alterada passa por aprendizado de 1 a 3 dias: não sugira pausar só por isso.
- Escalar = aumentar o orçamento aos poucos (no máximo +20% a 30% por vez), só no que já vende com custo por venda bom. Meta da loja: custo por venda de até R$ 35.
- Se o problema estiver no site (muitos cliques e visitas, pouca sacola ou pouco checkout), diga isso: trocar anúncio não resolve problema de página.
- O WhatsApp também é canal de venda: muita gente vê o anúncio e chama no WhatsApp (a IA atende e manda link de compra). Antes de dizer que o anúncio "não vende", olhe "whatsapp" (conversas novas, links de compra, pedidos vindos do WhatsApp) e "loja_toda" (vendas de todas as origens; "direto/sem origem" pode ser gente do anúncio que voltou depois). Cite esses números quando forem relevantes.
- Respeite as "regras fixas" que já rodam (lista "regras"); você pode concordar, discordar com motivo ou complementar, sem repetir igual.
- Você só sugere. Quem decide e executa é o dono, no Gerenciador de Anúncios. Nunca diga que você fez algo.
- No máximo 5 sugestões, da mais importante para a menos. Se está tudo bem, uma sugestão "manter" basta.
- Escreva de forma direta, sem enrolação e sem emojis.`;

// ---------- Coleta ----------

const r2 = (v: number) => Math.round(v * 100) / 100;

function resumoAnuncio(a: Anuncio) {
  return {
    nome: a.nome,
    campanha: a.campanha,
    ligado: a.chave !== 'PAUSED' && !['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'DISAPPROVED'].includes(a.status),
    status_meta: a.status,
    criado_em: a.criadoEm ? diaLocal(a.criadoEm) : null,
    gasto: r2(a.gasto),
    impressoes: a.impressoes,
    alcance: a.alcance,
    frequencia: r2(a.frequencia),
    cliques_link: a.cliquesLink,
    ctr_link: a.impressoes ? r2((a.cliquesLink / a.impressoes) * 100) : null,
    custo_por_clique: a.cliquesLink ? r2(a.gasto / a.cliquesLink) : null,
    viu_produto: a.verConteudo,
    sacola: a.sacola,
    checkout: a.checkout,
    compras_pixel: a.compras,
    custo_por_compra: a.compras ? r2(a.gasto / a.compras) : null,
  };
}

/** Junta os números (só agregados, sem dados de clientes) que o modelo vai analisar. */
export async function coletarDadosAnuncios(agora = Date.now()) {
  const hoje = diaLocal(agora);
  const dias3 = ultimosDias(3, agora);
  const nCampanha = Math.max(1, Math.round((Date.parse(hoje) - Date.parse(INICIO_CAMPANHA)) / 86_400_000) + 1);
  const diasCampanha = ultimosDias(nCampanha, agora);
  const p3 = { desde: dias3[0], ate: hoje };
  const pCampanha = { desde: diasCampanha[0], ate: hoje };

  const [conta, serie, ads3, adsCampanha, funil3, funilCampanha, bf, pedidos, regras] = await Promise.all([
    contaAnuncios().catch(() => null),
    porDia(pCampanha).catch(() => []),
    anuncios(p3).catch(() => []),
    anuncios(pCampanha).catch(() => []),
    somaFunil(dias3, 'meta').catch(() => null),
    somaFunil(diasCampanha, 'meta').catch(() => null),
    somaSinais(diasCampanha, 'meta').catch(() => null),
    pedidosRecentes(30).catch(() => []),
    lerMelhorias(),
  ]);

  // WhatsApp: muita gente vê o anúncio e chama no WhatsApp em vez de comprar direto no site
  const [conversas, registroIA] = await Promise.all([
    import('./conversas').then((m) => m.listarConversas(200)).catch(() => []),
    import('./registroIA').then((m) => m.lerRegistroIA()).catch(() => []),
  ]);
  const noDia = (ms: number | undefined, dias: string[]) => Boolean(ms) && dias.includes(diaLocal(ms!));
  const whatsapp = (dias: string[]) => ({
    conversas_novas: conversas.filter((c) => noDia(c.mensagens[0]?.em, dias)).length,
    conversas_com_mensagem_do_cliente: conversas.filter((c) => noDia(c.ultimaDoClienteEm, dias)).length,
    ia_respondeu: registroIA.filter((x) => x.resultado === 'respondeu' && noDia(x.em, dias)).length,
    ia_mandou_link_de_compra: registroIA.filter((x) => x.ferramentas?.includes('montar_link_compra') && noDia(x.em, dias)).length,
    pedidos_pagos_vindos_do_whatsapp: pedidos.filter((p) => p.origem?.source === 'whatsapp' && pago(p) && dias.includes(diaLocal(quando(p)))).length,
  });
  // Vendas da loja inteira (todas as origens), para não concluir "0 compras" olhando só o anúncio
  const lojaToda = (dias: string[]) => {
    const ps = pedidos.filter((p) => dias.includes(diaLocal(quando(p))));
    return {
      pedidos_pagos: ps.filter(pago).length,
      pedidos_aguardando_pagamento: ps.filter((p) => p.status === 'pending' || p.status === 'on-hold').length,
      por_origem: Object.fromEntries(
        Object.entries(
          ps.filter(pago).reduce<Record<string, number>>((acc, p) => ((acc[p.origem?.source || 'direto/sem origem'] = (acc[p.origem?.source || 'direto/sem origem'] || 0) + 1), acc), {})
        )
      ),
    };
  };

  const vendas = (dias: string[]) => {
    const ps = pedidos.filter((p) => p.origem?.source === 'meta' && pago(p) && dias.includes(diaLocal(quando(p))));
    return { pedidos_pagos: ps.length, faturamento: r2(ps.reduce((s, p) => s + p.total, 0)) };
  };

  return {
    hoje,
    hora: new Date(agora).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
    calendario: {
      inicio_campanha: INICIO_CAMPANHA,
      fim_black: diaLocal(PERIODO_BF.fim.getTime()),
      troca_para_anuncios_ultimos_dias: '2026-11-27',
      anuncio_ultimo_dia: '2026-11-30',
    },
    conta: conta ? { ativa: conta.status === 1, saldo: conta.saldo || null } : null,
    por_dia: serie.map((d) => ({ dia: d.dia, gasto: r2(d.gasto), impressoes: d.impressoes, cliques_link: d.cliquesLink, sacola: d.sacola, compras_pixel: d.compras })),
    anuncios_ultimos_3_dias: ads3.map(resumoAnuncio),
    anuncios_desde_inicio: adsCampanha.map(resumoAnuncio),
    site_quem_veio_do_anuncio: {
      ultimos_3_dias: funil3 ? { ...funil3, ...vendas(dias3) } : null,
      desde_inicio: funilCampanha ? { ...funilCampanha, ...vendas(diasCampanha) } : null,
    },
    pagina_black_vindos_do_anuncio: bf,
    whatsapp: { hoje: whatsapp([hoje]), ultimos_3_dias: whatsapp(dias3), desde_inicio: whatsapp(diasCampanha) },
    loja_toda: { hoje: lojaToda([hoje]), ultimos_3_dias: lojaToda(dias3) },
    regras: (regras?.lista || []).map((m) => ({ nivel: m.nivel, titulo: m.titulo, acao: m.acao })),
  };
}

// ---------- Modelo ----------

export function iaAnunciosDisponivel(): boolean {
  return Boolean(config.whatsapp.ia.chave);
}

const modeloAnuncios = () => process.env.ANUNCIOS_IA_MODELO?.trim() || 'claude-opus-5-5';

/** Roda a análise agora e guarda o resultado (Upstash). */
export async function analisarAnuncios(): Promise<AnaliseSalva> {
  if (!iaAnunciosDisponivel()) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const dados = await coletarDadosAnuncios();
  // A função da Vercel tem 60 s: a chamada precisa caber nisso
  const client = new Anthropic({ apiKey: config.whatsapp.ia.chave, timeout: 48_000, maxRetries: 0 });
  const modelo = modeloAnuncios();
  const r = await client.beta.messages.parse({
    model: modelo,
    max_tokens: 16000,
    // Se o modelo principal recusar, a própria API tenta outro modelo na mesma chamada
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SISTEMA,
    messages: [{ role: 'user', content: `Números de hoje (JSON):\n${JSON.stringify(dados)}` }],
    // effort baixo: análise objetiva e rápida (cabe no limite de tempo da Vercel)
    output_config: { effort: 'low', format: betaZodOutputFormat(Analise) },
  });
  if (r.stop_reason === 'refusal') throw new Error('A IA recusou a análise. Tente de novo mais tarde.');
  if (r.stop_reason === 'max_tokens') throw new Error('A resposta da IA ficou longa demais e foi cortada.');
  const analise = r.parsed_output;
  if (!analise) throw new Error('A IA respondeu fora do formato esperado.');
  const salva: AnaliseSalva = {
    em: Date.now(),
    modelo: r.model,
    analise: { ...analise, sugestoes: analise.sugestoes.slice(0, 5), destaques: analise.destaques.slice(0, 4), vigiar: analise.vigiar.slice(0, 3) },
    tokens: { entrada: r.usage.input_tokens, saida: r.usage.output_tokens },
  };
  await kvSet(CHAVE, salva, 7 * 86_400);
  return salva;
}

export function lerAnaliseAnuncios(): Promise<AnaliseSalva | null> {
  return kvGet<AnaliseSalva>(CHAVE).catch(() => null);
}

// ---------- Decisões do dono (Fiz / Ignorar), por id da sugestão ----------

export type Decisao = { acao: 'fiz' | 'ignorar'; em: number };

export async function lerDecisoes(): Promise<Record<string, Decisao>> {
  return (await kvGet<Record<string, Decisao>>(CHAVE_DECISOES).catch(() => null)) || {};
}

export async function decidirSugestao(id: string, acao: Decisao['acao'] | 'desfazer'): Promise<void> {
  const d = await lerDecisoes();
  if (acao === 'desfazer') delete d[id];
  else d[id] = { acao, em: Date.now() };
  // Decisões antigas (mais de 7 dias) saem: a sugestão pode voltar se continuar valendo
  for (const [k, v] of Object.entries(d)) if (Date.now() - v.em > 7 * 86_400_000) delete d[k];
  await kvSet(CHAVE_DECISOES, d, 14 * 86_400);
}

// ---------- Rotina automática (chamada pelo cron a cada 30 min; só roda quando vence) ----------

/**
 * 1x por dia: a partir das 9h, se ainda não houver análise feita hoje (automática ou pelo botão),
 * roda e manda o resumo para o celular. Assim o custo fica em ~1 análise por dia.
 */
export async function rotinaAnaliseAnuncios(forcar = false): Promise<string> {
  if (!iaAnunciosDisponivel()) return 'sem ANTHROPIC_API_KEY';
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  const ultima = await lerAnaliseAnuncios();
  if (!forcar && ultima && diaLocal(ultima.em) === diaLocal(Date.now())) return 'já analisou hoje';
  if (!forcar && hora < HORA_ANALISE_DIARIA) return 'antes do horário';
  const r = await analisarAnuncios();
  const { alertarCelular, alertasLigados, preferenciasAlertas } = await import('./alertas');
  if (alertasLigados() && (await preferenciasAlertas()).melhoria) {
    const icone = { bom: '🟢', atencao: '🟡', ruim: '🔴' }[r.analise.situacao];
    const sug = r.analise.sugestoes.map((x, i) => `${i + 1}. ${x.titulo}`).join('\n');
    await alertarCelular(
      `🤖 Análise dos anúncios ${icone}\n\n${r.analise.resumo}\n\n${sug}\n\nAprovar no painel: ${config.siteUrl.replace(/\/$/, '')}/painel/anuncios`.slice(0, 3900)
    ).catch(() => []);
  }
  return `ok (${r.analise.sugestoes.length} sugestões)`;
}
