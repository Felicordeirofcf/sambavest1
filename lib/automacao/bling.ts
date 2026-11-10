// Integração com o Bling (API v3): tokens, contatos, pedidos de venda, NF-e e estoque.
//
// O Bling troca o refresh token a cada renovação; por isso os tokens são guardados
// no KV (Upstash). As variáveis BLING_ACCESS_TOKEN / BLING_REFRESH_TOKEN só servem
// como ponto de partida — depois de autorizar em /api/bling/callback, nem precisam existir.
import { config } from './config';
import { adquirirTrava, kvGet, kvSet, liberarTrava } from './kv';
import { documentoCliente, enderecoEntrega, WcPedido } from './woocommerce';

const API = 'https://api.bling.com.br/Api/v3';
const CHAVE_TOKENS = 'bling:tokens';

type Tokens = { access_token: string; refresh_token: string; expira_em: number };

function basicAuth(): string {
  if (!config.bling.clientId || !config.bling.clientSecret) {
    throw new Error('BLING_CLIENT_ID / BLING_CLIENT_SECRET não configurados.');
  }
  return 'Basic ' + Buffer.from(`${config.bling.clientId}:${config.bling.clientSecret}`).toString('base64');
}

async function pedirTokens(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth(), Accept: '1.0' },
    body: new URLSearchParams(params),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Bling OAuth: ${json.error?.description || json.error?.message || res.status}`);
  }
  const tokens: Tokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expira_em: Date.now() + (Number(json.expires_in) || 21600) * 1000,
  };
  await kvSet(CHAVE_TOKENS, tokens);
  return tokens;
}

/** Troca o "code" do OAuth pelos tokens e salva no KV. Usado em /api/bling/callback. */
export function autorizarComCodigo(code: string): Promise<Tokens> {
  return pedirTokens({ grant_type: 'authorization_code', code });
}

async function renovarTokens(refreshAtual: string): Promise<Tokens> {
  // Evita duas renovações ao mesmo tempo (a segunda invalidaria a primeira).
  const pegou = await adquirirTrava('bling-refresh', 30);
  if (!pegou) {
    await new Promise((r) => setTimeout(r, 2500));
    const salvos = await kvGet<Tokens>(CHAVE_TOKENS);
    if (salvos && salvos.refresh_token !== refreshAtual) return salvos;
    throw new Error('Bling: renovação de token em andamento, tente novamente.');
  }
  try {
    return await pedirTokens({ grant_type: 'refresh_token', refresh_token: refreshAtual });
  } finally {
    await liberarTrava('bling-refresh');
  }
}

async function tokenAtual(forcarRenovacao = false): Promise<string> {
  let tokens = await kvGet<Tokens>(CHAVE_TOKENS);
  if (!tokens) {
    if (!config.bling.refreshToken) {
      throw new Error('Bling não autorizado. Acesse o link de autorização do app no Bling (veja AUTOMACAO.md).');
    }
    tokens = {
      access_token: config.bling.accessToken || '',
      refresh_token: config.bling.refreshToken,
      expira_em: config.bling.accessToken ? Date.now() + 60_000 : 0,
    };
  }
  if (forcarRenovacao || !tokens.access_token || tokens.expira_em - Date.now() < 5 * 60_000) {
    tokens = await renovarTokens(tokens.refresh_token);
  }
  return tokens.access_token;
}

export async function bling<T = unknown>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let ultimoStatus = 0;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const token = await tokenAtual(ultimoStatus === 401);
    const res = await fetch(`${API}${caminho}`, {
      method: init.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    ultimoStatus = res.status;
    if (res.status === 401 || res.status === 429) {
      // 401: token expirou → renova; 429: limite de 3 req/s → espera
      await new Promise((r) => setTimeout(r, res.status === 429 ? 1200 : 0));
      continue;
    }
    const texto = await res.text();
    let json: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      // resposta não-JSON (ex.: página de erro)
    }
    if (!res.ok) {
      const campos = json.error?.fields?.map((f: { msg?: string; element?: string }) => f.msg || f.element).join('; ');
      throw new Error(`Bling ${res.status} em ${caminho}: ${campos || json.error?.description || json.error?.message || texto.slice(0, 200)}`);
    }
    return json as T;
  }
  throw new Error(`Bling: falha repetida em ${caminho}`);
}

// ---------------- Contatos ----------------

async function obterOuCriarContato(pedido: WcPedido): Promise<number> {
  const doc = documentoCliente(pedido);
  const end = enderecoEntrega(pedido);
  const b = pedido.billing;

  if (doc) {
    const busca = await bling<{ data: { id: number }[] }>(`/contatos?numeroDocumento=${doc}`);
    if (busca.data?.length) return busca.data[0].id;
  }

  const criado = await bling<{ data: { id: number } }>('/contatos', {
    method: 'POST',
    body: {
      nome: `${b.first_name} ${b.last_name}`.trim() || end.nome,
      tipo: doc.length === 14 ? 'J' : 'F',
      situacao: 'A',
      numeroDocumento: doc,
      email: b.email,
      celular: b.phone,
      endereco: {
        geral: {
          endereco: end.rua,
          numero: end.numero,
          complemento: end.complemento,
          bairro: end.bairro,
          municipio: end.cidade,
          uf: end.uf,
          cep: end.cep,
        },
      },
    },
  });
  return criado.data.id;
}

// ---------------- Produtos ----------------

async function idProdutoPorCodigo(codigo: string): Promise<number | null> {
  if (!codigo) return null;
  const r = await bling<{ data: { id: number; codigo: string }[] }>(`/produtos?codigo=${encodeURIComponent(codigo)}`);
  return r.data?.find((p) => p.codigo === codigo)?.id ?? null;
}

// ---------------- Pedido de venda ----------------

/** Procura um pedido de venda já criado para este pedido do site (evita duplicar). */
export async function pedidoVendaExistente(pedido: WcPedido): Promise<{ id: number; numero?: number } | null> {
  try {
    const r = await bling<{ data: { id: number; numero?: number; numeroLoja?: string }[] }>(
      `/pedidos/vendas?numerosLojas[]=${encodeURIComponent(String(pedido.id))}`
    );
    return r.data?.find((p) => String(p.numeroLoja) === String(pedido.id)) ?? null;
  } catch {
    return null;
  }
}

export async function criarPedidoVenda(pedido: WcPedido): Promise<{ id: number; numero?: number }> {
  const existente = await pedidoVendaExistente(pedido);
  if (existente) return existente;

  const contatoId = await obterOuCriarContato(pedido);
  const end = enderecoEntrega(pedido);

  const itens = [];
  for (const item of pedido.line_items) {
    const produtoId = await idProdutoPorCodigo(item.sku);
    itens.push({
      codigo: item.sku || undefined,
      descricao: item.name,
      unidade: 'UN',
      quantidade: item.quantity,
      // total já inclui descontos (ex.: Pix), então o valor unitário fica correto
      valor: Number((Number(item.total) / item.quantity).toFixed(2)),
      ...(produtoId ? { produto: { id: produtoId } } : {}),
    });
  }

  const frete = pedido.shipping_lines?.[0];
  const r = await bling<{ data: { id: number; numero?: number } }>('/pedidos/vendas', {
    method: 'POST',
    body: {
      numeroLoja: String(pedido.id),
      data: (pedido.date_created_gmt || new Date().toISOString()).slice(0, 10),
      contato: { id: contatoId },
      ...(config.bling.lojaId ? { loja: { id: Number(config.bling.lojaId) } } : {}),
      itens,
      transporte: {
        frete: Number(pedido.shipping_total || 0),
        etiqueta: {
          nome: end.nome,
          endereco: end.rua,
          numero: end.numero,
          complemento: end.complemento,
          municipio: end.cidade,
          uf: end.uf,
          cep: end.cep,
          bairro: end.bairro,
        },
      },
      observacoes: frete ? `Frete: ${frete.method_title}` : '',
      observacoesInternas: `Pedido #${pedido.id} do site — ${pedido.payment_method_title}`,
    },
  });
  return r.data;
}

// ---------------- NF-e ----------------

/** Gera a NF-e a partir do pedido de venda e envia para a SEFAZ. */
export async function emitirNfe(idPedidoVenda: number): Promise<number> {
  const gerada = await bling<{ data: { id?: number; idNotaFiscal?: number } }>(
    `/pedidos/vendas/${idPedidoVenda}/gerar-nfe`,
    { method: 'POST' }
  );
  const idNota = gerada.data?.id ?? gerada.data?.idNotaFiscal;
  if (!idNota) throw new Error('Bling não retornou o ID da NF-e gerada.');
  await bling(`/nfe/${idNota}/enviar`, { method: 'POST' });
  return idNota;
}

/** Retorna a chave de acesso da NF-e quando ela já estiver autorizada. */
export async function chaveNfe(idNota: number): Promise<string | null> {
  const r = await bling<{ data: { chaveAcesso?: string; situacao?: number } }>(`/nfe/${idNota}`);
  return r.data?.chaveAcesso || null;
}

// ---------------- Estoque ----------------

/** Mapa código (SKU) → saldo virtual de todos os produtos ativos do Bling. */
export async function saldosPorCodigo(): Promise<Map<string, number>> {
  const ids = new Map<number, string>();
  for (let pagina = 1; pagina <= 50; pagina++) {
    const r = await bling<{ data: { id: number; codigo: string }[] }>(
      `/produtos?pagina=${pagina}&limite=100&criterio=2`
    );
    for (const p of r.data || []) if (p.codigo) ids.set(p.id, p.codigo);
    if (!r.data || r.data.length < 100) break;
  }

  const saldos = new Map<string, number>();
  const lista = [...ids.keys()];
  for (let i = 0; i < lista.length; i += 50) {
    const qs = lista.slice(i, i + 50).map((id) => `idsProdutos[]=${id}`).join('&');
    const r = await bling<{ data: { produto: { id: number }; saldoVirtualTotal: number }[] }>(`/estoques/saldos?${qs}`);
    for (const s of r.data || []) {
      const codigo = ids.get(s.produto.id);
      if (codigo) saldos.set(codigo, Math.max(0, Math.floor(Number(s.saldoVirtualTotal) || 0)));
    }
  }
  return saldos;
}
