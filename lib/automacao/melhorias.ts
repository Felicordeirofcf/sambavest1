// Monitor de melhorias dos anúncios: a cada 3 h olha os números da Meta e do site e sugere
// o que fazer para chegar a mais clientes (pausar o pior, escalar o melhor, trocar arte,
// seguir o calendário da Black...). Cada sugestão nova vai para o celular uma vez por dia
// e a lista atual fica no painel de anúncios.
import type { Anuncio, ContaAnuncios } from './metaAds';
import { kvGet, kvSet } from './kv';

export type Melhoria = { id: string; nivel: 'erro' | 'atencao' | 'ok'; titulo: string; detalhe: string; acao: string };

export type EntradaMelhorias = {
  agora: number;
  conta: ContaAnuncios | null;
  /** Anúncios com os números dos últimos 3 dias. */
  anuncios: Anuncio[];
  /** Funil do site só de quem veio do anúncio, últimos 3 dias. */
  siteAnuncio: { visita: number; produto: number; sacola: number; checkout: number };
  capiLigado: boolean;
  /** O que quem veio do anúncio fez na página da Black (3 dias). */
  paginaBlack?: { abriu: number; saiu5s: number; ficou15s: number; toques: number };
  /** Datas do calendário da campanha (ms). */
  calendario: { ultimosDias: number; ultimoDia: number; fim: number; inicio: number };
};

const CHAVE = 'melhorias:atual';
export const INTERVALO_MELHORIAS_MS = 3 * 3_600_000;

const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PARADOS = ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'DISAPPROVED'];
// Desligado na chave (mesmo que a Meta ainda mostre "em análise") conta como parado
const ligado = (a: Anuncio) => a.chave !== 'PAUSED' && !PARADOS.includes(a.status);
const EM_ANALISE = ['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'];

/** Regras puras (testáveis): recebe os números e devolve as sugestões. */
export function gerarMelhorias(e: EntradaMelhorias): Melhoria[] {
  const r: Melhoria[] = [];
  const { agora, calendario: cal } = e;
  const durante = agora >= cal.inicio && agora <= cal.fim;
  // Só anúncios da campanha atual (criados nos últimos 30 dias)
  const ads = e.anuncios.filter((a) => !a.criadoEm || agora - a.criadoEm < 30 * 86_400_000);
  const ehUltimosDias = (a: Anuncio) => sem(a.nome).includes('ultimos dias');
  const ehUltimoDia = (a: Anuncio) => sem(a.nome).includes('ultimo dia');
  const ehPrincipal = (a: Anuncio) => !ehUltimosDias(a) && !ehUltimoDia(a);

  // 1) Calendário da Black
  if (durante) {
    const cedoUltimos = ads.filter((a) => ehUltimosDias(a) && ligado(a) && agora < cal.ultimosDias);
    if (cedoUltimos.length) {
      r.push({
        id: 'cal-ultimos-cedo',
        nivel: 'erro',
        titulo: 'Anúncio de "últimos dias" ligado antes da hora',
        detalhe: `${cedoUltimos.map((a) => a.nome).join(', ')} está ligado, mas ainda não são os últimos dias. Divide a verba e confunde o cliente.`,
        acao: 'Pause esses anúncios no Gerenciador. Eles entram em 27/11.',
      });
    }
    const cedoUltimo = ads.filter((a) => ehUltimoDia(a) && ligado(a) && agora < cal.ultimoDia);
    if (cedoUltimo.length) {
      r.push({
        id: 'cal-ultimo-cedo',
        nivel: 'erro',
        titulo: 'Anúncio de "último dia" ligado antes da hora',
        detalhe: `${cedoUltimo.map((a) => a.nome).join(', ')} está ligado antes de 30/11.`,
        acao: 'Pause e ligue só no dia 30/11.',
      });
    }
    if (agora >= cal.ultimosDias && agora < cal.ultimoDia) {
      const desligados = ads.filter((a) => ehUltimosDias(a) && !ligado(a));
      const principaisLigados = ads.filter((a) => ehPrincipal(a) && ligado(a) && sem(a.campanha).includes('black'));
      if (desligados.length || principaisLigados.length) {
        r.push({
          id: 'cal-ultimos-hora',
          nivel: 'atencao',
          titulo: 'Hora da reta final: trocar para os anúncios de "últimos dias"',
          detalhe: [
            desligados.length ? `Ligar: ${desligados.map((a) => a.nome).join(', ')}.` : '',
            principaisLigados.length ? `Desligar: ${principaisLigados.map((a) => a.nome).join(', ')}.` : '',
          ].join(' '),
          acao: 'No Gerenciador: ligue os anúncios 3 e 4, desligue o 1 e o 2 e suba o orçamento para R$ 35/dia.',
        });
      }
    }
    if (agora >= cal.ultimoDia) {
      const desligado = ads.filter((a) => ehUltimoDia(a) && !ligado(a));
      if (desligado.length) {
        r.push({
          id: 'cal-ultimo-hora',
          nivel: 'atencao',
          titulo: 'Último dia da Black: ligar o anúncio "último dia"',
          detalhe: `${desligado.map((a) => a.nome).join(', ')} está desligado.`,
          acao: 'Ligue o anúncio 5 e deixe os de "últimos dias" ligados até 23h59.',
        });
      }
    }
  }

  // 2) Análise demorando
  const presos = ads.filter((a) => ligado(a) && EM_ANALISE.includes(a.status) && a.criadoEm && agora - a.criadoEm > 24 * 3_600_000);
  if (presos.length) {
    r.push({
      id: 'analise-24h',
      nivel: 'erro',
      titulo: `${presos.length} anúncio(s) em análise há mais de 24 h`,
      detalhe: presos.map((a) => a.nome).join(', '),
      acao: 'Duplique o anúncio (às vezes destrava) ou revise texto/arte: evite "você", promessas e muito texto na imagem.',
    });
  }

  // 3) Conta
  if (e.conta && e.conta.status !== 1) {
    r.push({ id: 'conta', nivel: 'erro', titulo: 'Conta de anúncios parada', detalhe: e.conta.saldo || 'A Meta não entrega nenhum anúncio.', acao: 'Confira saldo e pagamento.' });
  }

  // 4) Comparar anúncios ligados (com dados suficientes)
  const comDados = ads.filter((a) => ligado(a) && a.impressoes >= 1500);
  if (comDados.length >= 2) {
    const ctr = (a: Anuncio) => a.cliquesLink / a.impressoes;
    const ord = [...comDados].sort((a, b) => ctr(b) - ctr(a));
    const melhor = ord[0];
    const pior = ord[ord.length - 1];
    if (ctr(melhor) >= 1.6 * ctr(pior) && ctr(melhor) > 0) {
      r.push({
        id: `pausar-pior:${pior.id}`,
        nivel: 'atencao',
        titulo: `"${melhor.nome}" atrai muito mais cliques que "${pior.nome}"`,
        detalhe: `CTR de ${pct(ctr(melhor))} contra ${pct(ctr(pior))} nos últimos 3 dias.`,
        acao: `Pause "${pior.nome}" para a verba ir toda para o que funciona.`,
      });
    }
  }

  // 5) Por anúncio: arte cansada, poucos cliques, clique caro
  for (const a of ads.filter((x) => ligado(x) && x.impressoes >= 1500)) {
    const ctr = a.cliquesLink / a.impressoes;
    if (a.frequencia >= 3) {
      r.push({
        id: `fadiga:${a.id}`,
        nivel: 'atencao',
        titulo: `"${a.nome}" já foi visto ${a.frequencia.toFixed(1)}× por pessoa`,
        detalhe: 'O mesmo público está cansando da mesma arte.',
        acao: 'Suba uma arte nova (foto de alguém vestindo, outra cor de fundo) ou amplie o público.',
      });
    }
    if (ctr < 0.008) {
      r.push({
        id: `ctr:${a.id}`,
        nivel: 'atencao',
        titulo: `"${a.nome}" com poucos cliques (CTR ${pct(ctr)})`,
        detalhe: `${a.impressoes.toLocaleString('pt-BR')} exibições e ${a.cliquesLink} cliques em 3 dias.`,
        acao: 'Teste o preço "R$ 99" na primeira linha do texto e uma foto de pessoa vestindo a camisa.',
      });
    }
    if (a.cliquesLink >= 20 && a.gasto / a.cliquesLink > 1.2) {
      r.push({
        id: `cpc:${a.id}`,
        nivel: 'atencao',
        titulo: `Clique caro em "${a.nome}" (${brl(a.gasto / a.cliquesLink)})`,
        detalhe: 'Acima de R$ 1,20 por clique fica difícil vender camisa de R$ 99 com lucro.',
        acao: 'Troque a arte ou deixe o público aberto (Advantage+).',
      });
    }
  }

  // 6) Escalar o que vende
  const totais = ads.reduce(
    (s, a) => ({ gasto: s.gasto + a.gasto, compras: s.compras + a.compras, cliques: s.cliques + a.cliquesLink, sacola: s.sacola + a.sacola }),
    { gasto: 0, compras: 0, cliques: 0, sacola: 0 }
  );
  if (totais.compras >= 2 && totais.gasto / totais.compras <= 35) {
    r.push({
      id: 'escalar',
      nivel: 'ok',
      titulo: `Está vendendo barato: ${brl(totais.gasto / totais.compras)} por venda`,
      detalhe: `${totais.compras} compras com ${brl(totais.gasto)} nos últimos 3 dias.`,
      acao: 'Suba o orçamento em 20% (no máximo 1 vez a cada 2 dias, para não reiniciar o aprendizado).',
    });
  }
  if (totais.gasto >= 60 && totais.compras === 0 && totais.sacola === 0) {
    r.push({
      id: 'gasto-sem-sacola',
      nivel: 'atencao',
      titulo: `${brl(totais.gasto)} em 3 dias e ninguém colocou na sacola pelo anúncio`,
      detalhe: 'As pessoas clicam, mas não chegam a escolher a camisa.',
      acao: 'Confira se o link abre direto na camisa certa e se a página mostra preço e tamanho sem rolar.',
    });
  }

  // 7) Clique → site
  const s = e.siteAnuncio;
  if (totais.cliques >= 30 && s.visita / totais.cliques < 0.5) {
    r.push({
      id: 'clique-sem-visita',
      nivel: 'erro',
      titulo: `Só ${pct(s.visita / totais.cliques)} dos cliques chegam ao site`,
      detalhe: `${totais.cliques} cliques na Meta e ${s.visita} visitas vindas do anúncio.`,
      acao: 'Abra o anúncio no celular: veja se o link e o UTM estão certos e se a página demora.',
    });
  }
  if (s.visita >= 30 && s.produto / s.visita < 0.25) {
    r.push({
      id: 'visita-sem-camisa',
      nivel: 'atencao',
      titulo: `Quem vem do anúncio quase não abre uma camisa (${pct(s.produto / s.visita)})`,
      detalhe: `${s.visita} visitas do anúncio e ${s.produto} abriram uma camisa.`,
      acao: 'Mande o link do anúncio direto para a camisa da arte (ex.: /produto/viradouro-2027) em vez da página geral.',
    });
  }

  // 7b) Página da Black: toque sem querer × página que não convence
  const pb = e.paginaBlack;
  if (pb && pb.abriu >= 30) {
    if (pb.saiu5s / pb.abriu >= 0.4) {
      r.push({
        id: 'bf-saida-rapida',
        nivel: 'atencao',
        titulo: `${pct(pb.saiu5s / pb.abriu)} de quem vem do anúncio sai da página da Black em até 5 s`,
        detalhe: 'Sem rolar nem tocar: é toque sem querer (comum no Story) ou o topo não mostra logo o que o anúncio prometeu.',
        acao: 'Compare com o Carrossel; se só o Story tiver isso, é toque sem querer e o custo real por visita é maior. Se for geral, deixe a camisa e o preço do anúncio no topo.',
      });
    } else if (pb.ficou15s / pb.abriu >= 0.4 && pb.toques / pb.abriu < 0.15) {
      r.push({
        id: 'bf-olha-nao-toca',
        nivel: 'atencao',
        titulo: 'Ficam na página da Black, mas quase ninguém toca numa camisa',
        detalhe: `${pb.ficou15s} ficaram 15 s ou mais e só ${pb.toques} tocaram em alguma camisa.`,
        acao: 'A página não está convencendo: teste foto de gente vestindo no topo, um selo de "últimas unidades" ou frete grátis acima de um valor menor.',
      });
    }
  }

  // 8) Sinal de conversão e alcance
  if (!e.capiLigado) {
    r.push({
      id: 'capi',
      nivel: 'atencao',
      titulo: 'A Meta está perdendo parte das compras (API de Conversões desligada)',
      detalhe: 'Sem o META_CAPI_TOKEN a Meta só vê o que o navegador manda; bloqueadores e iPhone escondem compras e a otimização fica pior.',
      acao: 'Gere o token no Gerenciador de Eventos (pixel 2779685332183949) e coloque META_CAPI_TOKEN na Vercel.',
    });
  }
  if (durante && !ads.some((a) => ligado(a) && /retro|80 anos/.test(sem(a.nome)))) {
    r.push({
      id: 'retro-sem-anuncio',
      nivel: 'ok',
      titulo: 'A Retrô 80 Anos não tem anúncio próprio',
      detalhe: 'Hoje os anúncios mostram o duelo Beija-Flor × Viradouro; a Retrô (R$ 150) não aparece.',
      acao: 'Quando tiver a foto, crie um anúncio da Retrô ou um anúncio de catálogo (Advantage+) com o conjunto "Black Friday".',
    });
  }
  const ordem = { erro: 0, atencao: 1, ok: 2 };
  return r.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

export async function salvarMelhorias(lista: Melhoria[], em = Date.now()): Promise<void> {
  await kvSet(CHAVE, { em, lista }, 7 * 86_400);
}

export async function lerMelhorias(): Promise<{ em: number; lista: Melhoria[] } | null> {
  return kvGet<{ em: number; lista: Melhoria[] }>(CHAVE).catch(() => null);
}
