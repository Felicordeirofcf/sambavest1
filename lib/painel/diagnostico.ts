// Diagnóstico "por que não estão comprando": regras simples sobre o caminho inteiro
// (anúncio → clique → site → camisa → sacola → checkout → pedido → pagamento) e as falhas reais
// registradas pelo site (frete, checkout). Cada achado diz onde está o problema e o que fazer.
import type { Anuncio, ContaAnuncios, Numeros } from '../automacao/metaAds';
import type { TipoFalha } from '../automacao/monitor';

export type Achado = { nivel: 'erro' | 'atencao' | 'ok'; titulo: string; detalhe: string; acao: string };

export type EntradaDiagnostico = {
  conta: ContaAnuncios | null;
  meta: Numeros | null;
  anuncios: Anuncio[];
  site: { visita: number; produto: number; sacola: number; checkout: number } | null;
  pedidosCriados: number; // pedidos do anúncio (qualquer status)
  pedidosPagos: number;
  pagamentosRecusados: number; // pedidos do anúncio com status "failed"
  falhas: Record<TipoFalha, number>;
  carrinhosAbandonados: number;
  horasDeCampanha: number;
};

const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function diagnosticar(e: EntradaDiagnostico): Achado[] {
  const r: Achado[] = [];
  const m = e.meta;
  const ativos = e.anuncios.filter((a) => a.status === 'ACTIVE');
  const emAnalise = e.anuncios.filter((a) => ['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'].includes(a.status));
  const reprovados = e.anuncios.filter((a) => (a.status === 'DISAPPROVED' || a.status === 'WITH_ISSUES') && Date.now() - a.criadoEm < 30 * 86_400_000);

  // 1) Entrega do anúncio
  if (e.conta && e.conta.status !== 1) {
    r.push({ nivel: 'erro', titulo: 'A conta de anúncios está parada', detalhe: e.conta.saldo || 'A Meta não está entregando nenhum anúncio.', acao: 'Confira saldo e pagamento no Gerenciador de Anúncios.' });
  }
  if (reprovados.length) {
    r.push({
      nivel: 'erro',
      titulo: `${reprovados.length} anúncio(s) reprovado(s) ou com problema`,
      detalhe: reprovados.map((a) => `${a.nome}${a.motivoReprovacao ? `: ${a.motivoReprovacao}` : ''}`).join(' · '),
      acao: 'Ajuste o texto/arte conforme o motivo e envie para análise de novo.',
    });
  }
  if (!ativos.length && emAnalise.length) {
    r.push({ nivel: 'atencao', titulo: 'Anúncios ainda em análise', detalhe: `${emAnalise.length} anúncio(s) esperando a Meta aprovar.`, acao: 'Normal nas primeiras horas. Se passar de 24 h, revise texto e arte.' });
  }
  if (m && ativos.length && m.impressoes === 0 && e.horasDeCampanha >= 6) {
    r.push({ nivel: 'erro', titulo: 'Anúncios ativos sem nenhuma exibição', detalhe: 'A Meta não está mostrando os anúncios.', acao: 'Confira saldo, limite de gastos e se o público/orçamento não está restrito demais.' });
  }

  // 2) O anúncio chama atenção?
  if (m && m.impressoes >= 1000) {
    const ctr = m.cliquesLink / m.impressoes;
    if (ctr < 0.006) {
      r.push({ nivel: 'atencao', titulo: `Poucas pessoas clicam no anúncio (CTR ${pct(ctr)})`, detalhe: `${m.impressoes.toLocaleString('pt-BR')} exibições e só ${m.cliquesLink} cliques.`, acao: 'Teste outra arte (pessoa vestindo a camisa) e um texto com o preço logo na 1ª linha.' });
    }
    if (m.frequencia > 3.5) {
      r.push({ nivel: 'atencao', titulo: `O mesmo público está vendo demais (${m.frequencia.toFixed(1)}× por pessoa)`, detalhe: 'O anúncio está cansando quem já viu.', acao: 'Troque a arte ou amplie o público.' });
    }
    if (m.cliquesLink >= 20 && m.gasto / m.cliquesLink > 1.5) {
      r.push({ nivel: 'atencao', titulo: `Clique caro (${brl(m.gasto / m.cliquesLink)} por clique)`, detalhe: 'Acima de R$ 1,50 por clique fica difícil vender camisa de R$ 99 com lucro.', acao: 'Teste outra arte; deixe a Meta escolher o público (Advantage+).' });
    }
  }

  // 3) Do clique ao site: a página carrega?
  if (m && e.site && m.cliquesLink >= 20) {
    const chegaram = e.site.visita / m.cliquesLink;
    if (chegaram < 0.5) {
      r.push({
        nivel: 'erro',
        titulo: `Muita gente clica e não chega ao site (${pct(Math.min(1, chegaram))})`,
        detalhe: `${m.cliquesLink} cliques na Meta e ${e.site.visita} visitas registradas.`,
        acao: 'Pode ser página lenta no celular ou link errado. Abra o anúncio no celular e veja quanto demora; confira o link e o UTM.',
      });
    }
  }

  // 4) Dentro do site
  const s = e.site;
  if (s && s.visita >= 20) {
    if (s.produto / s.visita < 0.3) {
      r.push({ nivel: 'atencao', titulo: `Poucos abrem uma camisa (${pct(s.produto / s.visita)} das visitas)`, detalhe: `${s.visita} visitas e ${s.produto} abriram uma camisa.`, acao: 'A página da Black precisa chamar mais: foto da camisa vestida, preço grande e botão visível sem rolar.' });
    }
    if (s.produto >= 15 && s.sacola / s.produto < 0.08) {
      r.push({ nivel: 'atencao', titulo: `Abrem a camisa mas não colocam na sacola (${pct(s.sacola / s.produto)})`, detalhe: `${s.produto} abriram e ${s.sacola} colocaram na sacola.`, acao: 'A página já mostra as medidas em texto, o frete para todo o Brasil e a barra de compra fixa no celular. Se continuar baixo por 2–3 dias, o próximo teste é o preço do frete (ex.: frete grátis a partir de 2 camisas) e foto de gente vestindo logo na primeira imagem. Chame no WhatsApp quem aparece em "Recuperar vendas".' });
    }
    if (s.sacola >= 8 && s.checkout / s.sacola < 0.4) {
      r.push({ nivel: 'atencao', titulo: `Colocam na sacola e não vão ao checkout (${pct(s.checkout / s.sacola)})`, detalhe: `${s.sacola} sacolas e ${s.checkout} chegaram no checkout.`, acao: 'Geralmente é o valor do frete. Teste mostrar o frete antes ou oferecer frete grátis acima de um valor menor.' });
    }
  }
  if (s && s.checkout >= 5 && e.pedidosCriados / s.checkout < 0.3) {
    r.push({ nivel: 'atencao', titulo: `Chegam no checkout e não fazem o pedido (${pct(e.pedidosCriados / s.checkout)})`, detalhe: `${s.checkout} no checkout e ${e.pedidosCriados} pedidos criados. ${e.carrinhosAbandonados} carrinho(s) abandonado(s) com e-mail.`, acao: 'Veja as falhas de frete/checkout abaixo; os e-mails de carrinho abandonado já tentam recuperar.' });
  }

  // 5) Falhas reais registradas pelo site
  const f = e.falhas;
  if (f['frete-erro'] > 0) r.push({ nivel: 'erro', titulo: `${f['frete-erro']} erro(s) ao calcular o frete`, detalhe: 'O Melhor Envio falhou para esses clientes: sem frete não dá para comprar.', acao: 'Confira o token e o saldo do Melhor Envio; veja "Cálculo de frete" no monitoramento.' });
  if (f['frete-vazio'] > 0) r.push({ nivel: 'atencao', titulo: `${f['frete-vazio']} consulta(s) de frete sem nenhuma opção`, detalhe: 'Para alguns CEPs o Melhor Envio não ofereceu transportadora.', acao: 'Confira as transportadoras ativas no Melhor Envio e as medidas/peso do pacote.' });
  if (f['checkout-erro'] > 0) r.push({ nivel: 'erro', titulo: `${f['checkout-erro']} erro(s) ao criar o pedido`, detalhe: 'O cliente clicou em pagar e o pedido não foi criado (WooCommerce/servidor).', acao: 'Veja o monitoramento do WooCommerce; se repetir, me mande o print.' });
  if (f['checkout-recusado'] > 3) r.push({ nivel: 'atencao', titulo: `${f['checkout-recusado']} tentativa(s) recusada(s) no checkout`, detalhe: 'Produto indisponível, frete não escolhido ou frete que mudou.', acao: 'Confira estoque e preços das camisas da Black no WooCommerce.' });

  // 6) Pagamento
  if (e.pedidosCriados >= 3 && e.pedidosPagos / e.pedidosCriados < 0.5) {
    r.push({ nivel: 'atencao', titulo: `Fazem o pedido e não pagam (${pct(e.pedidosPagos / e.pedidosCriados)} pagos)`, detalhe: `${e.pedidosCriados} pedidos do anúncio e ${e.pedidosPagos} pagos. ${e.pagamentosRecusados} pagamento(s) recusado(s).`, acao: 'Chame os Pix pendentes no WhatsApp (lista na visão geral); se houver muitos cartões recusados, fale com a AppMax.' });
  }

  // 7) Gasto sem venda
  if (m && m.gasto >= 60 && e.pedidosPagos === 0) {
    r.push({ nivel: 'atencao', titulo: `${brl(m.gasto)} gastos e nenhuma venda pelo anúncio ainda`, detalhe: 'Pode ser cedo, mas vale olhar os pontos acima para ver onde as pessoas param.', acao: 'Não mexa nos 3 primeiros dias; depois, corrija o ponto com mais perda no funil.' });
  }

  if (!r.length) {
    r.push({
      nivel: 'ok',
      titulo: 'Nenhum problema encontrado',
      detalhe: m && m.cliquesLink < 20 ? 'Ainda há poucos dados para um diagnóstico firme (menos de 20 cliques).' : 'O caminho do anúncio até o pagamento está funcionando.',
      acao: 'Acompanhe por mais alguns dias.',
    });
  }
  const ordem = { erro: 0, atencao: 1, ok: 2 };
  return r.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
