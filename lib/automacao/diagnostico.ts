// Diagnóstico do Bling: só LÊ dados (Bling, WooCommerce e KV), não altera nada.
// Rodar: GET /api/cron/automacao?tarefa=diagnostico (ou GitHub → Actions → Run workflow → "diagnostico").
//
// Responde em português, com "ok" / "atenção" / "erro" em cada item, para o dono
// saber o que falta configurar antes de ligar o pedido de venda, a NF-e e o estoque.
import { bling, estadoTokens, listarProdutosAtivos } from './bling';
import { config, integracoes } from './config';
import { M } from './pedidos';
import { listarPedidos, meta, wc } from './woocommerce';

type Item = { status: 'ok' | 'atenção' | 'erro'; detalhe: string; [extra: string]: unknown };

const PADRAO_NATUREZA: Record<number, string> = {
  1: 'padrão de venda',
  3: 'padrão de venda física',
  4: 'padrão de venda jurídica',
};

async function item(fn: () => Promise<Item>): Promise<Item> {
  try {
    return await fn();
  } catch (e) {
    return { status: 'erro', detalhe: (e as Error).message };
  }
}

type WcProduto = { id: number; name: string; type: string; sku: string; manage_stock: boolean | 'parent' };

async function skusDoSite(): Promise<{ sku: string; nome: string; gerenciaEstoque: boolean }[]> {
  const lista: { sku: string; nome: string; gerenciaEstoque: boolean }[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const produtos = await wc<WcProduto[]>(`/products?status=publish&per_page=100&page=${pagina}`);
    for (const p of produtos) {
      if (p.type === 'variable') {
        const vars = await wc<WcProduto[]>(`/products/${p.id}/variations?per_page=100`);
        for (const v of vars) lista.push({ sku: v.sku, nome: p.name, gerenciaEstoque: v.manage_stock === true });
      } else {
        lista.push({ sku: p.sku, nome: p.name, gerenciaEstoque: p.manage_stock === true });
      }
    }
    if (produtos.length < 100) break;
  }
  return lista;
}

export async function diagnosticoBling(): Promise<Record<string, unknown>> {
  const r: Record<string, unknown> = {
    chaves: {
      bling: integracoes.bling() ? 'ok' : 'faltam BLING_CLIENT_ID / BLING_CLIENT_SECRET',
      upstash: integracoes.kv() ? 'ok' : 'faltam KV_REST_API_URL / KV_REST_API_TOKEN (os tokens do Bling não ficam salvos)',
      woocommerce: integracoes.woo() ? 'ok' : 'faltam WC_CONSUMER_KEY / WC_CONSUMER_SECRET',
      webhookWoo: config.woo.webhookSecret ? 'ok' : 'falta WC_WEBHOOK_SECRET',
      cron: config.cronSecret ? 'ok' : 'falta CRON_SECRET',
    },
    ligado: {
      enviarPedidos: config.bling.enviarPedidos,
      emitirNfe: config.bling.emitirNfe,
      sincronizarEstoque: config.bling.sincronizarEstoque,
      lojaId: config.bling.lojaId || null,
    },
  };
  if (!integracoes.bling()) return r;

  r.tokens = await item(async () => {
    const t = await estadoTokens();
    if (!t.salvosNoKv) {
      return {
        status: integracoes.kv() ? 'atenção' : 'erro',
        detalhe: 'Tokens do Bling não estão no Upstash. Abra o link de convite do app no Bling e autorize de novo (depois do deploy com o Upstash).',
      };
    }
    return { status: 'ok', detalhe: `Tokens salvos; o atual vale até ${t.expiraEm}` };
  });

  // Uma chamada simples confirma que o token funciona (e renova se precisar).
  r.conexao = await item(async () => {
    await bling('/naturezas-operacoes?limite=1');
    return { status: 'ok', detalhe: 'API do Bling respondeu' };
  });
  if ((r.conexao as Item).status !== 'ok') return r;

  r.naturezaOperacao = await item(async () => {
    const n = await bling<{ data: { id: number; descricao: string; padrao?: number }[] }>(
      '/naturezas-operacoes?situacao=1&limite=100'
    );
    const padrao = (n.data || []).filter((x) => x.padrao && PADRAO_NATUREZA[x.padrao]);
    if (!padrao.length) {
      return {
        status: 'atenção',
        detalhe: 'Nenhuma natureza de operação ativa marcada como padrão de venda. A NF-e gerada pelo pedido usa essa natureza.',
        ativas: (n.data || []).map((x) => x.descricao),
      };
    }
    return {
      status: 'ok',
      detalhe: padrao.map((x) => `${x.descricao} (${PADRAO_NATUREZA[x.padrao!]})`).join('; '),
    };
  });

  r.formasPagamento = await item(async () => {
    const tipos: [number, string][] = [
      [17, 'Pix'],
      [3, 'Cartão de crédito'],
    ];
    const achadas: string[] = [];
    const faltam: string[] = [];
    for (const [tipo, nome] of tipos) {
      const f = await bling<{ data: { descricao: string }[] }>(`/formas-pagamentos?situacao=1&tiposPagamentos[]=${tipo}`);
      if (f.data?.length) achadas.push(`${nome}: ${f.data[0].descricao}`);
      else faltam.push(nome);
    }
    return faltam.length
      ? {
          status: 'atenção',
          detalhe: `Sem forma de pagamento ativa do tipo ${faltam.join(' e ')} no Bling (cadastro de Formas de pagamento). Pedidos com esse pagamento vão sem parcela.`,
          achadas,
        }
      : { status: 'ok', detalhe: achadas.join('; ') };
  });

  const produtosBling = await listarProdutosAtivos().catch((e: Error) => e);
  const skusSite = integracoes.woo() ? await skusDoSite().catch((e: Error) => e) : new Error('WooCommerce não configurado');

  r.skus = await item(async () => {
    if (produtosBling instanceof Error) throw produtosBling;
    if (skusSite instanceof Error) throw skusSite;
    const semSku = skusSite.filter((s) => !s.sku).map((s) => s.nome);
    const comSku = skusSite.filter((s) => s.sku);
    const faltamNoBling = comSku.filter((s) => !produtosBling.has(s.sku)).map((s) => `${s.sku} (${s.nome})`);
    const status = semSku.length || faltamNoBling.length ? 'atenção' : 'ok';
    return {
      status,
      detalhe: `${comSku.length} SKUs no site, ${produtosBling.size} códigos ativos no Bling, ${comSku.length - faltamNoBling.length} casam.`,
      semSkuNoSite: [...new Set(semSku)].slice(0, 50),
      faltamNoBling: faltamNoBling.slice(0, 100),
      comEstoqueGerenciadoNoSite: comSku.filter((s) => s.gerenciaEstoque).length,
    };
  });

  r.ncm = await item(async () => {
    if (produtosBling instanceof Error) throw produtosBling;
    if (skusSite instanceof Error) throw skusSite;
    // NCM normalmente fica no produto pai das variações; confere 1 por produto pai, até 15.
    const ids = new Map<number, string>();
    for (const s of skusSite) {
      const p = s.sku ? produtosBling.get(s.sku) : undefined;
      if (p && ids.size < 15) ids.set(p.idPai || p.id, s.nome);
    }
    const semNcm: string[] = [];
    for (const [id, nome] of ids) {
      const d = await bling<{ data: { nome?: string; tributacao?: { ncm?: string; origem?: number } } }>(`/produtos/${id}`);
      if (!d.data?.tributacao?.ncm) semNcm.push(d.data?.nome || nome);
    }
    return semNcm.length
      ? { status: 'atenção', detalhe: `Produtos sem NCM no Bling (a NF-e seria rejeitada): ${semNcm.join(', ')}`, conferidos: ids.size }
      : { status: 'ok', detalhe: `NCM preenchido nos ${ids.size} produtos conferidos` };
  });

  r.pedidosRecentes = await item(async () => {
    const desde = new Date(Date.now() - 15 * 86_400_000);
    const pedidos = await listarPedidos('processing', desde, 30);
    const linhas = pedidos.map((p) => ({
      pedido: p.id,
      criado: p.date_created_gmt,
      blingPedido: meta(p, M.blingPedido) || null,
      nfe: meta(p, M.blingNfe) || null,
      nfeChave: meta(p, M.nfeChave) ? 'sim' : null,
      erro: meta(p, M.erro) || null,
    }));
    const comErro = linhas.filter((l) => l.erro).length;
    return {
      status: comErro ? 'atenção' : 'ok',
      detalhe: `${linhas.length} pedidos pagos (Processando) nos últimos 15 dias; ${comErro} com erro de automação.`,
      pedidos: linhas,
    };
  });

  return r;
}
