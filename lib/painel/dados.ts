// Dados do painel: pedidos do WooCommerce em formato enxuto, com cache curto no Upstash.
import { kvDel, kvGet, kvSet } from '../automacao/kv';
import { M } from '../automacao/pedidos';
import { documentoCliente, meta, wc, WcPedido } from '../automacao/woocommerce';

export type ItemResumo = { nome: string; sku: string; qtd: number; total: number; produto: number; variacao: number };

export type PedidoResumo = {
  id: number;
  status: string;
  total: number;
  frete: number;
  desconto: number;
  criado: number; // ms
  pago: number | null; // ms
  metodo: string; // id do gateway
  metodoNome: string;
  freteNome: string;
  cliente: { nome: string; email: string; telefone: string; documento: string; cidade: string; uf: string };
  itens: ItemResumo[];
  marcas: {
    bling?: string;
    nfe?: string;
    nfeChave?: string;
    envio?: string;
    etiqueta?: string;
    rastreio?: string;
    erro?: string;
    avisoPago?: string;
    avisoEnviado?: string;
    avisoPix?: string;
  };
};

export const STATUS_PAGO = ['processing', 'completed'];

export const STATUS_NOME: Record<string, string> = {
  pending: 'Pagamento pendente',
  processing: 'Pago · a enviar',
  'on-hold': 'Aguardando',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  failed: 'Falhou',
  'checkout-draft': 'Rascunho',
};

const data = (s?: string | null) => (s ? new Date(s + 'Z').getTime() : null);

export function resumir(p: WcPedido): PedidoResumo {
  const b = p.billing || ({} as WcPedido['billing']);
  const m = (k: string) => meta(p, k);
  return {
    id: p.id,
    status: p.status,
    total: Number(p.total) || 0,
    frete: Number(p.shipping_total) || 0,
    desconto: Number(p.discount_total) || 0,
    criado: data(p.date_created_gmt) || 0,
    pago: data(p.date_paid_gmt),
    metodo: p.payment_method || '',
    metodoNome: p.payment_method_title || p.payment_method || '—',
    freteNome: p.shipping_lines?.[0]?.method_title || '',
    cliente: {
      nome: `${b.first_name || ''} ${b.last_name || ''}`.trim() || 'Sem nome',
      email: (b.email || '').trim().toLowerCase(),
      telefone: b.phone || m('_billing_phone') || '',
      documento: documentoCliente(p),
      cidade: b.city || p.shipping?.city || '',
      uf: (b.state || p.shipping?.state || '').toUpperCase(),
    },
    itens: (p.line_items || []).map((i) => ({
      nome: i.name,
      sku: i.sku || '',
      qtd: i.quantity,
      total: Number(i.total) || 0,
      produto: i.product_id,
      variacao: i.variation_id,
    })),
    marcas: {
      bling: m(M.blingPedido),
      nfe: m(M.blingNfe),
      nfeChave: m(M.nfeChave),
      envio: m(M.meEnvio),
      etiqueta: m(M.meEtiqueta),
      rastreio: m(M.rastreio) || m('_correios_tracking_code'),
      erro: m(M.erro),
      avisoPago: m(M.avisoPago),
      avisoEnviado: m(M.avisoEnviado),
      avisoPix: m(M.avisoPix),
    },
  };
}

const CACHE_S = 120;
const MAX_PEDIDOS = 3000;
const chaveCache = (dias: number) => `painel:pedidos:${dias}`;

/** Pedidos (todos os status) criados nos últimos `dias` dias, do mais novo para o mais antigo. */
export async function pedidosRecentes(dias: number): Promise<PedidoResumo[]> {
  const chave = chaveCache(dias);
  try {
    const cache = await kvGet<PedidoResumo[]>(chave);
    if (cache) return cache;
  } catch {
    // sem cache
  }
  const depoisDe = new Date(Date.now() - dias * 86_400_000).toISOString();
  const lista: PedidoResumo[] = [];
  for (let pagina = 1; lista.length < MAX_PEDIDOS; pagina++) {
    const lote = await wc<WcPedido[]>(
      `/orders?after=${depoisDe}&per_page=100&page=${pagina}&orderby=date&order=desc&status=any`
    );
    lista.push(...lote.filter((p) => p.status !== 'checkout-draft').map(resumir));
    if (lote.length < 100) break;
  }
  try {
    // O Upstash aceita até ~1 MB por comando; listas maiores ficam sem cache.
    if (JSON.stringify(lista).length < 900_000) await kvSet(chave, lista, CACHE_S);
  } catch {
    // ignora
  }
  return lista;
}

/** Limpa o cache depois de uma ação no painel (mudar status, rastreio...). */
export async function limparCache(): Promise<void> {
  await Promise.all([7, 14, 30, 60, 90, 180, 365].map((d) => kvDel(chaveCache(d)).catch(() => undefined)));
}

// ---------- Produtos e estoque ----------

type WcProduto = {
  id: number;
  name: string;
  type: string;
  status: string;
  sku: string;
  price: string;
  stock_status: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  total_sales?: number;
  images?: { src: string }[];
};

type WcVariacao = {
  id: number;
  sku: string;
  price: string;
  stock_status: string;
  manage_stock: boolean | 'parent';
  stock_quantity: number | null;
  attributes: { name: string; option: string }[];
};

export type LinhaEstoque = {
  produtoId: number;
  variacaoId: number;
  produto: string;
  variacao: string;
  sku: string;
  preco: number;
  gerencia: boolean;
  quantidade: number | null;
  situacao: string; // instock | outofstock | onbackorder
  imagem?: string;
};

export async function estoque(): Promise<LinhaEstoque[]> {
  const chave = 'painel:estoque';
  try {
    const cache = await kvGet<LinhaEstoque[]>(chave);
    if (cache) return cache;
  } catch {
    // sem cache
  }
  const produtos: WcProduto[] = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const lote = await wc<WcProduto[]>(`/products?status=publish&per_page=100&page=${pagina}`);
    produtos.push(...lote);
    if (lote.length < 100) break;
  }
  const linhas: LinhaEstoque[] = [];
  await Promise.all(
    produtos.map(async (p) => {
      const imagem = p.images?.[0]?.src;
      if (p.type !== 'variable') {
        linhas.push({
          produtoId: p.id,
          variacaoId: 0,
          produto: p.name,
          variacao: '',
          sku: p.sku,
          preco: Number(p.price) || 0,
          gerencia: p.manage_stock,
          quantidade: p.stock_quantity,
          situacao: p.stock_status,
          imagem,
        });
        return;
      }
      const vars = await wc<WcVariacao[]>(`/products/${p.id}/variations?per_page=100`).catch(() => []);
      for (const v of vars) {
        linhas.push({
          produtoId: p.id,
          variacaoId: v.id,
          produto: p.name,
          variacao: v.attributes.map((a) => a.option).join(' / '),
          sku: v.sku,
          preco: Number(v.price) || 0,
          gerencia: v.manage_stock === true || (v.manage_stock === 'parent' && p.manage_stock),
          quantidade: v.manage_stock === 'parent' ? p.stock_quantity : v.stock_quantity,
          situacao: v.stock_status,
          imagem,
        });
      }
    })
  );
  linhas.sort((a, b) => a.produto.localeCompare(b.produto) || a.variacao.localeCompare(b.variacao));
  try {
    await kvSet(chave, linhas, 600);
  } catch {
    // ignora
  }
  return linhas;
}

// ---------- SKUs do Bling (para cruzar com o WooCommerce) ----------

/**
 * Código (SKU) → saldo no Bling. Cache de 30 min.
 * Devolve o erro em texto quando o Bling não responde, para a tela mostrar o motivo.
 */
export async function skusBling(): Promise<{ mapa: Map<string, number | null> | null; erro?: string }> {
  const chave = 'painel:bling:skus';
  try {
    const salvo = await kvGet<[string, number | null][]>(chave);
    if (salvo) return { mapa: new Map(salvo) };
  } catch {
    // sem cache
  }
  try {
    const { listarProdutosAtivos } = await import('../automacao/bling');
    const mapa = await listarProdutosAtivos();
    const pares = [...mapa].map(([codigo, p]) => [codigo.trim().toUpperCase(), p.saldo ?? null] as [string, number | null]);
    if (pares.length === 0) return { mapa: null, erro: 'o Bling não devolveu nenhum produto com código' };
    await kvSet(chave, pares, 1800).catch(() => undefined);
    return { mapa: new Map(pares) };
  } catch (e) {
    console.error('[painel] falha ao listar produtos do Bling', e);
    return { mapa: null, erro: (e as Error).message };
  }
}
