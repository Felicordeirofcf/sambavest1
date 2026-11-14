// Auditoria rápida (só leitura): diz se loja, anúncios, funil, feed e rotinas estão funcionando.
// O resultado aparece no log público do GitHub Actions, então NÃO inclui valores em R$,
// saldo, dados de clientes nem pedidos: só status e contagens de tráfego.
import { config, integracoes } from './config';
import { ultimaExecucao, falhasNosDias } from './monitor';
import { verificarSaude } from './saude';
import { somaFunil } from '../painel/funil';
import { diaLocal } from '../painel/metricas';
import { faseBF } from '../blackfridayPeriodo';

const DIA = 86_400_000;
const minutosAtras = (ms?: number) => (ms ? Math.round((Date.now() - ms) / 60_000) : null);

export async function auditoria(): Promise<Record<string, unknown>> {
  const hoje = diaLocal(Date.now());
  const ontem = diaLocal(Date.now() - DIA);
  const r: Record<string, unknown> = { quando: new Date().toISOString(), black: faseBF() };

  const partes = await Promise.allSettled([
    // 1) Site
    verificarSaude().then((c) => (r.saude = c.map((x) => `${x.ok ? 'ok' : 'FALHA'} ${x.nome} (${x.ms} ms)`))),

    // 2) Anúncios
    (async () => {
      if (!integracoes.metaAds()) return (r.anuncios = 'META_ADS_TOKEN não configurado');
      const { contaAnuncios, anuncios, NOME_STATUS, STATUS_CONTA } = await import('./metaAds');
      const [conta, hojeAds, ontemAds] = await Promise.all([
        contaAnuncios(),
        anuncios({ desde: hoje, ate: hoje }),
        anuncios({ desde: ontem, ate: ontem }),
      ]);
      const porIdOntem = new Map(ontemAds.map((a) => [a.id, a]));
      r.contaAnuncios = { status: STATUS_CONTA[conta.status] || `código ${conta.status}`, bloqueio: conta.motivoBloqueio ?? null };
      r.anuncios = hojeAds.slice(0, 10).map((a) => {
        const o = porIdOntem.get(a.id);
        return {
          nome: a.nome,
          status: NOME_STATUS[a.status]?.rotulo || a.status,
          chave: a.chave === 'PAUSED' ? 'desligado' : a.chave === 'ACTIVE' ? 'ligado' : a.chave || '?',
          reprovacao: a.motivoReprovacao || undefined,
          hoje: { impressoes: a.impressoes, cliquesLink: a.cliquesLink, sacola: a.sacola, checkout: a.checkout, compras: a.compras },
          ontem: o ? { impressoes: o.impressoes, cliquesLink: o.cliquesLink, sacola: o.sacola, checkout: o.checkout, compras: o.compras } : null,
        };
      });
    })(),

    // 3) Funil do site (contadores anônimos)
    (async () => {
      const [h, o, hm, om] = await Promise.all([somaFunil([hoje]), somaFunil([ontem]), somaFunil([hoje], 'meta'), somaFunil([ontem], 'meta')]);
      r.funil = { hoje: h, ontem: o, vindoDoAnuncioHoje: hm, vindoDoAnuncioOntem: om };
      const { somaSinais } = await import('../painel/comportamentoBF');
      const soNaoZero = (x: Record<string, number>) => Object.fromEntries(Object.entries(x).filter(([, v]) => v > 0));
      const [bh, bm] = await Promise.all([somaSinais([hoje]), somaSinais([hoje], 'meta')]);
      r.paginaBlackHoje = { todos: soNaoZero(bh), vindoDoAnuncio: soNaoZero(bm) };
    })(),

    // 3b) IA do WhatsApp: ligada? a chave e o modelo funcionam? o que ela fez hoje?
    (async () => {
      const ia = config.whatsapp.ia;
      const { lerRegistroIA } = await import('./registroIA');
      const registro = await lerRegistroIA();
      const deHoje = registro.filter((x) => diaLocal(x.em) === hoje);
      const conta = (t: string) => deHoje.filter((x) => x.resultado === t).length;
      const erros = registro.filter((x) => x.resultado === 'erro').slice(0, 3);
      let teste = 'sem ANTHROPIC_API_KEY';
      if (ia.chave) {
        // Chamada mínima (poucos tokens) só para provar que chave, modelo e crédito estão ok
        const t0 = Date.now();
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': ia.chave, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: ia.modelo, max_tokens: 16, messages: [{ role: 'user', content: 'Responda só: ok' }] }),
            signal: AbortSignal.timeout(20_000),
          });
          const corpo = (await res.json().catch(() => ({}))) as { error?: { type?: string; message?: string } };
          teste = res.ok ? `ok (${Date.now() - t0} ms)` : `FALHA ${res.status}: ${corpo.error?.type || ''} ${corpo.error?.message || ''}`.trim();
        } catch (e) {
          teste = `FALHA: ${(e as Error).message}`;
        }
      }
      r.iaWhatsapp = {
        ligada: ia.ativa,
        chave: Boolean(ia.chave),
        modelo: ia.modelo,
        testeDaChave: teste,
        canal: integracoes.whatsapp() ? 'API oficial' : integracoes.evolution() ? 'Evolution' : 'nenhum',
        hoje: { respondeu: conta('respondeu'), passouParaPessoa: conta('transferiu'), pediuTexto: conta('pediu-texto'), erros: conta('erro') },
        ultimaTentativaMinAtras: minutosAtras(registro[0]?.em),
        ultimosErros: erros.map((x) => ({ minAtras: minutosAtras(x.em), erro: x.detalhe })),
      };
    })(),

    // 4) Rotinas e falhas
    (async () => {
      const [cron, webhook, alerta, falhas] = await Promise.all([
        ultimaExecucao('cron'),
        ultimaExecucao('webhook-woo'),
        ultimaExecucao('alerta'),
        falhasNosDias([ontem, hoje]),
      ]);
      r.rotinas = {
        cronMinAtras: minutosAtras(cron?.em),
        cronOk: cron?.ok ?? null,
        webhookWooMinAtras: minutosAtras(webhook?.em),
        ultimoAlertaMinAtras: minutosAtras(alerta?.em),
      };
      r.falhasOntemEHoje = falhas;
    })(),

    // 4b) Melhorias sugeridas (só os códigos: os textos podem ter valores em R$)
    (async () => {
      const { lerMelhorias } = await import('./melhorias');
      const m = await lerMelhorias();
      r.melhorias = m ? { minAtras: minutosAtras(m.em), codigos: m.lista.map((x) => `${x.nivel}:${x.id.split(':')[0]}`) } : null;
    })(),

    // 5) Feed do catálogo da Meta
    (async () => {
      const res = await fetch(`${config.siteUrl}/api/feed/meta`, { cache: 'no-store', signal: AbortSignal.timeout(40_000) });
      const linhas = (await res.text()).trim().split('\n');
      const cab = linhas[0]?.split(',') || [];
      const iLabel = cab.indexOf('custom_label_0');
      r.feed = {
        http: res.status,
        itens: Math.max(0, linhas.length - 1),
        temCustomLabel: iLabel >= 0,
        comBlackFriday: linhas.filter((l) => l.includes('black_friday')).length,
      };
    })(),
  ]);

  r.integracoes = {
    kv: integracoes.kv(),
    capi: integracoes.meta(),
    metaAds: integracoes.metaAds(),
    telegram: integracoes.telegram(),
    evolution: integracoes.evolution(),
  };
  const erros = partes.flatMap((p, i) => (p.status === 'rejected' ? [`parte ${i + 1}: ${(p.reason as Error)?.message || p.reason}`] : []));
  if (erros.length) r.erros = erros;
  return r;
}
