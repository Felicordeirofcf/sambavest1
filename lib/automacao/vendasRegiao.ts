// Vendas por estado e região (só leitura). Cruza os pedidos do WooCommerce com o alcance dos anúncios
// por estado, para decidir onde vale concentrar a verba.
//
// Sai no log PÚBLICO do GitHub Actions: só contagens e porcentagens. Nada de nome, telefone, e-mail,
// nº de pedido, cidade com poucas vendas ou valores em R$.
import { norm, pago } from '../painel/metricas';
import { pedidosRecentes, PedidoResumo } from '../painel/dados';
import { integracoes } from './config';
import { porRegiao } from './metaAds';

const REGIOES: Record<string, string> = {
  RJ: 'Sudeste', SP: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
  BA: 'Nordeste', PE: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', RN: 'Nordeste', AL: 'Nordeste', SE: 'Nordeste', PI: 'Nordeste',
  RS: 'Sul', PR: 'Sul', SC: 'Sul',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  PA: 'Norte', AM: 'Norte', AC: 'Norte', RO: 'Norte', RR: 'Norte', AP: 'Norte', TO: 'Norte',
};

const NOMES: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
  goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB',
  parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

/** "State of Rio de Janeiro" / "Rio de Janeiro" → "RJ" */
const ufDaMeta = (nome: string): string => {
  const limpo = norm(nome).replace(/^(state of|estado de|estado do|estado da)\s+/, '').trim();
  return NOMES[limpo] || '';
};

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);
const pecas = (p: PedidoResumo) => p.itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);

type Acum = { criados: number; pagos: number; pecas: number; faturamento: number; fretesGratis: number; pix: number };
const vazio = (): Acum => ({ criados: 0, pagos: 0, pecas: 0, faturamento: 0, fretesGratis: 0, pix: 0 });

function somar(a: Acum, p: PedidoResumo) {
  a.criados++;
  if (!pago(p)) return;
  a.pagos++;
  a.pecas += pecas(p);
  a.faturamento += p.total;
  if (p.frete === 0) a.fretesGratis++;
  if (p.metodo.includes('pix')) a.pix++;
}

export async function vendasPorRegiao(dias = 365): Promise<Record<string, unknown>> {
  const todos = (await pedidosRecentes(dias)).filter((p) => p.status !== 'checkout-draft');
  const comUf = todos.filter((p) => p.cliente.uf);
  const porUf = new Map<string, Acum>();
  const porRegiaoVenda = new Map<string, Acum>();
  for (const p of comUf) {
    const uf = p.cliente.uf;
    const reg = REGIOES[uf] || 'Outros';
    if (!porUf.has(uf)) porUf.set(uf, vazio());
    if (!porRegiaoVenda.has(reg)) porRegiaoVenda.set(reg, vazio());
    somar(porUf.get(uf)!, p);
    somar(porRegiaoVenda.get(reg)!, p);
  }
  const totalPagos = [...porUf.values()].reduce((s, a) => s + a.pagos, 0);
  const totalFat = [...porUf.values()].reduce((s, a) => s + a.faturamento, 0);
  const totalPecas = [...porUf.values()].reduce((s, a) => s + a.pecas, 0);
  const totalCriados = [...porUf.values()].reduce((s, a) => s + a.criados, 0);

  const linha = (a: Acum) => ({
    pedidosPagos: a.pagos,
    pedidosCriados: a.criados,
    pctDosPedidosPagos: pct(a.pagos, totalPagos),
    pctDoFaturamento: pct(a.faturamento, totalFat),
    pecas: a.pecas,
    pecasPorPedido: a.pagos ? Math.round((a.pecas / a.pagos) * 10) / 10 : 0,
    taxaDePagamento: `${Math.round(pct(a.pagos, a.criados))}%`,
    pctComFreteGratis: `${Math.round(pct(a.fretesGratis, a.pagos))}%`,
    pctPix: `${Math.round(pct(a.pix, a.pagos))}%`,
  });

  // Anúncios: de onde vem o alcance e o clique (porcentagens, sem gasto em R$)
  let anuncios: Record<string, unknown> | string = 'Meta Ads não configurado';
  const adsPorUf = new Map<string, { impressoes: number; cliques: number; gasto: number; sacola: number; checkout: number }>();
  if (integracoes.metaAds()) {
    try {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const linhas = await porRegiao({ desde: '2026-11-12', ate: hoje });
      for (const l of linhas) {
        const uf = ufDaMeta(l.regiao);
        if (!uf) continue;
        const a = adsPorUf.get(uf) || { impressoes: 0, cliques: 0, gasto: 0, sacola: 0, checkout: 0 };
        a.impressoes += l.impressoes;
        a.cliques += l.cliquesLink;
        a.gasto += l.gasto;
        a.sacola += l.sacola;
        a.checkout += l.checkout;
        adsPorUf.set(uf, a);
      }
      const totImp = [...adsPorUf.values()].reduce((s, a) => s + a.impressoes, 0);
      const totCli = [...adsPorUf.values()].reduce((s, a) => s + a.cliques, 0);
      const totGasto = [...adsPorUf.values()].reduce((s, a) => s + a.gasto, 0);
      const totSac = [...adsPorUf.values()].reduce((s, a) => s + a.sacola, 0);
      anuncios = {
        desde: '2026-11-12',
        porEstado: Object.fromEntries(
          [...adsPorUf.entries()]
            .sort((a, b) => b[1].gasto - a[1].gasto)
            .slice(0, 12)
            .map(([uf, a]) => [
              uf,
              {
                pctDoGasto: pct(a.gasto, totGasto),
                pctDasImpressoes: pct(a.impressoes, totImp),
                pctDosCliques: pct(a.cliques, totCli),
                pctDasSacolas: pct(a.sacola, totSac),
                pctDasVendasPagas: pct(porUf.get(uf)?.pagos || 0, totalPagos),
                // >1 = vende mais do que o gasto sugere; <1 = gasta mais do que vende
                vendaPorGasto: a.gasto > 0 && totalPagos > 0 ? Math.round(((porUf.get(uf)?.pagos || 0) / totalPagos) / (a.gasto / totGasto) * 100) / 100 : null,
              },
            ])
        ),
      };
    } catch (e) {
      anuncios = `erro ao ler a Meta: ${(e as Error).message.slice(0, 120)}`;
    }
  }

  const primeiro = Math.min(...comUf.map((p) => p.criado), Date.now());
  return {
    periodo: { dias, primeiroPedido: new Date(primeiro).toISOString().slice(0, 10) },
    total: { pedidosCriados: totalCriados, pedidosPagos: totalPagos, pecas: totalPecas, taxaDePagamento: `${Math.round(pct(totalPagos, totalCriados))}%` },
    semEstado: todos.length - comUf.length,
    porRegiao: Object.fromEntries([...porRegiaoVenda.entries()].sort((a, b) => b[1].pagos - a[1].pagos).map(([r, a]) => [r, linha(a)])),
    porEstado: Object.fromEntries([...porUf.entries()].sort((a, b) => b[1].pagos - a[1].pagos || b[1].criados - a[1].criados).slice(0, 15).map(([uf, a]) => [uf, linha(a)])),
    anuncios,
  };
}
