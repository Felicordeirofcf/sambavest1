// Cliente mínimo da API REST do WooCommerce usado pelas automações.
import { config } from './config';
import { chaveTelefone } from './whatsapp';

export type WcMeta = { id?: number; key: string; value: unknown };

export type WcLineItem = {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  sku: string;
  total: string;
  price: number;
};

export type WcEndereco = {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  email?: string;
  phone?: string;
};

export type WcPedido = {
  id: number;
  status: string;
  total: string;
  shipping_total: string;
  discount_total: string;
  date_created_gmt: string;
  date_paid_gmt?: string | null;
  payment_method: string;
  payment_method_title: string;
  payment_url?: string;
  order_key: string;
  billing: WcEndereco;
  shipping: WcEndereco;
  line_items: WcLineItem[];
  shipping_lines: { method_id: string; method_title: string; total: string }[];
  meta_data: WcMeta[];
};

function authHeader(): string {
  if (!config.woo.key || !config.woo.secret) {
    throw new Error('Credenciais do WooCommerce (WC_CONSUMER_KEY / WC_CONSUMER_SECRET) não configuradas.');
  }
  return 'Basic ' + Buffer.from(`${config.woo.key}:${config.woo.secret}`).toString('base64');
}

export async function wc<T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${config.woo.url}/wp-json/wc/v3${caminho}`, {
    method: init.method || 'GET',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const texto = await res.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta não-JSON (ex.: página de erro do servidor)
  }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message || texto.slice(0, 200);
    throw new Error(`WooCommerce ${res.status} em ${caminho}: ${msg}`);
  }
  return json as T;
}

export function meta(pedido: WcPedido, chave: string): string | undefined {
  const m = pedido.meta_data?.find((x) => x.key === chave);
  if (m === undefined || m.value === null || m.value === undefined || m.value === '') return undefined;
  return String(m.value);
}

export function obterPedido(id: number | string): Promise<WcPedido> {
  return wc<WcPedido>(`/orders/${id}`);
}

/** Lista pedidos de um status criados depois de uma data (ISO). */
export async function listarPedidos(status: string, depoisDe: Date, maximo = 100): Promise<WcPedido[]> {
  const resultado: WcPedido[] = [];
  for (let pagina = 1; resultado.length < maximo; pagina++) {
    const lote = await wc<WcPedido[]>(
      `/orders?status=${status}&after=${depoisDe.toISOString()}&per_page=50&page=${pagina}&orderby=date&order=asc`
    );
    resultado.push(...lote);
    if (lote.length < 50) break;
  }
  return resultado.slice(0, maximo);
}

/** Grava metadados no pedido (sobrescreve chaves existentes). Pode também mudar o status. */
export async function salvarNoPedido(
  pedido: WcPedido,
  valores: Record<string, string | number>,
  status?: string
): Promise<void> {
  const meta_data = Object.entries(valores).map(([key, value]) => ({ key, value: String(value) }));
  await wc(`/orders/${pedido.id}`, { method: 'PUT', body: { meta_data, ...(status ? { status } : {}) } });
  // mantém o objeto local atualizado para os próximos passos
  for (const m of meta_data) {
    const existente = pedido.meta_data.find((x) => x.key === m.key);
    if (existente) existente.value = m.value;
    else pedido.meta_data.push(m);
  }
  if (status) pedido.status = status;
}

/** Adiciona uma nota ao pedido. Se paraCliente=true, o WooCommerce também manda por e-mail ao cliente. */
export async function adicionarNota(pedido: WcPedido, nota: string, paraCliente = false): Promise<void> {
  await wc(`/orders/${pedido.id}/notes`, { method: 'POST', body: { note: nota, customer_note: paraCliente } });
}

// ---------- Dados do cliente a partir do pedido ----------

/**
 * O checkout do site grava número e bairro em metadados próprios.
 * Para pedidos antigos, tenta extrair de "Rua X, 123 - Bairro".
 */
export function enderecoEntrega(pedido: WcPedido) {
  const end = pedido.shipping?.address_1 ? pedido.shipping : pedido.billing;
  let rua = end.address_1 || '';
  let numero = meta(pedido, '_billing_number') || meta(pedido, '_shipping_number') || '';
  let bairro = meta(pedido, '_billing_neighborhood') || meta(pedido, '_shipping_neighborhood') || '';

  const m = rua.match(/^(.*?),\s*([^,-]+?)\s*-\s*(.+)$/);
  if (m) {
    rua = m[1].trim();
    numero = numero || m[2].trim();
    bairro = bairro || m[3].trim();
  }

  return {
    nome: `${end.first_name || ''} ${end.last_name || ''}`.trim(),
    rua,
    numero: numero || 'S/N',
    complemento: end.address_2 || '',
    bairro,
    cidade: end.city || '',
    uf: (end.state || '').toUpperCase(),
    cep: (end.postcode || '').replace(/\D/g, ''),
  };
}

export function documentoCliente(pedido: WcPedido): string {
  return (meta(pedido, '_billing_cpf') || meta(pedido, 'cpf') || meta(pedido, '_billing_cnpj') || '').replace(/\D/g, '');
}

export function linkPagamento(pedido: WcPedido): string {
  if (pedido.payment_url) return pedido.payment_url;
  return `${config.woo.url}/finalizar-compra/order-pay/${pedido.id}/?pay_for_order=true&key=${pedido.order_key}`;
}

// ---------- Atendimento (WhatsApp) ----------

/** true se os dois telefones são o mesmo (ignora formatação, +55 e o 9 extra do celular). */
export function mesmoTelefone(a: string, b: string): boolean {
  const ka = chaveTelefone(a);
  return Boolean(ka && ka === chaveTelefone(b));
}

/**
 * Pedidos recentes de um telefone, do mais novo para o mais antigo.
 * A busca do WooCommerce compara texto, e o telefone pode estar salvo como "(21) 99695-9903"
 * ou "21996959903". Os 4 últimos dígitos aparecem juntos em qualquer formato, então
 * buscamos por eles e filtramos pelo telefone completo.
 */
export async function pedidosDoTelefone(telefone: string, dias = 180): Promise<WcPedido[]> {
  const d = (telefone || '').replace(/\D/g, '');
  if (d.length < 10) return [];
  const depoisDe = new Date(Date.now() - dias * 86_400_000).toISOString();
  const lote = await wc<WcPedido[]>(
    `/orders?search=${d.slice(-4)}&after=${depoisDe}&per_page=100&orderby=date&order=desc`
  );
  return lote.filter((p) => mesmoTelefone(p.billing?.phone || '', telefone) || mesmoTelefone(p.shipping?.phone || '', telefone));
}
