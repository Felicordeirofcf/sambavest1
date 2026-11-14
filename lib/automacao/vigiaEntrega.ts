// Vigia da entrega dos anúncios: avisa no celular quando a Meta para de mostrar o anúncio
// (horas sem exibição, entrega que despenca em relação a ontem, conta bloqueada, conjunto com problema) ou quando o saldo pré-pago está acabando.
// Roda junto com o cron (a cada 30 min). O resultado vai para o log público do GitHub Actions,
// então só devolve situação e motivos, sem valores em R$.
import { alertarCelular } from './alertas';
import { integracoes } from './config';
import { diaLocal } from '../painel/metricas';

const horaLocal = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })) % 24;

export async function resumoEntrega() {
  const { entregaAnuncios } = await import('./metaAds');
  const e = await entregaAnuncios(diaLocal(Date.now()), horaLocal(), diaLocal(Date.now() - 86_400_000));
  const resumo: Record<string, unknown> = {
    situacao: e.situacao,
    motivos: e.motivos,
    horasSemEntrega: e.horasSemEntrega,
    exibicoesPorHoraHoje: Object.fromEntries(e.porHora.map((x) => [`${x.hora}h`, x.impressoes])),
    ultimas3h: e.ultimas3h,
    saldo:
      e.saldo === null
        ? 'sem saldo pré-pago (conta paga no cartão?)'
        : !e.orcamentoDia
          ? 'saldo lido, mas não achei o orçamento diário (orçamento total?)'
          : e.saldo < e.orcamentoDia
            ? 'baixo: menos de 1 dia de orçamento'
            : e.saldo < e.orcamentoDia * 2
              ? 'atenção: menos de 2 dias de orçamento'
              : 'ok',
    orcamentoDiario: e.orcamentoDia ? 'encontrado' : 'não encontrado (orçamento total ou sem permissão)',
    conjuntos: e.conjuntos.map((c) => ({ nome: c.nome, status: c.status, aprendizado: c.aprendizado, problemas: c.problemas?.length ? c.problemas : undefined })),
  };
  return { resumo, detalhe: e };
}

export async function rotinaVigiaEntrega(): Promise<Record<string, unknown>> {
  if (!integracoes.metaAds()) return { pulado: 'META_ADS_TOKEN não configurado' };
  const { resumo: r, detalhe: e } = await resumoEntrega();
  if (e.situacao !== 'ok') {
    // O alerta vai só para o celular do dono (pode ter valores); o log fica sem eles
    const saldo =
      e.saldo !== null && e.orcamentoDia
        ? `\nSaldo: R$ ${e.saldo.toFixed(2).replace('.', ',')} · orçamento/dia: R$ ${e.orcamentoDia.toFixed(2).replace('.', ',')}`
        : '';
    const titulo = e.situacao === 'parado' ? '🚨 Anúncio parado ou para parar' : '⚠️ Anúncio pede atenção';
    const texto = `${titulo}\n- ${e.motivos.join('\n- ')}${saldo}\n\nConfira no Gerenciador de Anúncios (saldo, cobrança e status do conjunto).`;
    // Um aviso por situação a cada 6 h (não fica repetindo a cada 30 min)
    r.alerta = await alertarCelular(texto, { chave: `entrega:${e.situacao}:${e.motivos.map((m) => m.split(' ')[0]).join('|')}`, ttlS: 6 * 3600 });
  }
  return r;
}
