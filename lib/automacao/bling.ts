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

// ---------------- Utilitários ----------------

const arred = (n: number) => Math.round(n * 100) / 100;

/** Data (AAAA-MM-DD) no fuso de Brasília. O WooCommerce manda date_created_gmt sem o "Z". */
function dataBrasil(gmt?: string): string {
  const d = gmt ? new Date(gmt.endsWith('Z') ? gmt : `${gmt}Z`) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

/** Monta "chave[]=a&chave[]=b" (formato de lista da API v3). */
function lista(chave: string, valores: (string | number)[]): string {
  return valores.map((v) => `${chave}[]=${encodeURIComponent(String(v))}`).join('&');
}

// ---------------- Contatos ----------------

type EnderecoBling = {
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
};

type ContatoBling = {
  id: number;
  numeroDocumento?: string;
  situacao?: string;
  endereco?: { geral?: Partial<EnderecoBling>; cobranca?: Partial<EnderecoBling> };
  [campo: string]: unknown;
};

/**
 * Procura o cliente pelo CPF/CNPJ (criterio=1: todos, senão a busca só olha os últimos
 * incluídos). Se já existe, atualiza o endereço quando ele mudou — a NF-e usa o endereço
 * do contato. Se não existe, cria como consumidor final não contribuinte (indicadorIe 9).
 */
async function obterOuCriarContato(pedido: WcPedido, avisos: string[]): Promise<number> {
  const doc = documentoCliente(pedido);
  const end = enderecoEntrega(pedido);
  const b = pedido.billing;
  const geral: EnderecoBling = {
    endereco: end.rua,
    numero: end.numero,
    complemento: end.complemento,
    bairro: end.bairro,
    municipio: end.cidade,
    uf: end.uf,
    cep: end.cep,
  };

  if (doc) {
    const busca = await bling<{ data: ContatoBling[] }>(`/contatos?numeroDocumento=${doc}&criterio=1`);
    const existente = busca.data?.find(
      (c) => c.situacao !== 'E' && String(c.numeroDocumento || '').replace(/\D/g, '') === doc
    );
    if (existente) {
      try {
        await atualizarEnderecoContato(existente.id, geral);
      } catch (e) {
        avisos.push(`não consegui atualizar o endereço do contato ${existente.id} no Bling (${(e as Error).message})`);
      }
      return existente.id;
    }
  }

  const criado = await bling<{ data: { id: number } }>('/contatos', {
    method: 'POST',
    body: {
      nome: `${b.first_name} ${b.last_name}`.trim() || end.nome,
      tipo: doc.length === 14 ? 'J' : 'F',
      situacao: 'A',
      numeroDocumento: doc,
      indicadorIe: 9, // não contribuinte do ICMS (consumidor final)
      email: b.email,
      emailNotaFiscal: b.email,
      celular: b.phone,
      endereco: { geral },
    },
  });
  return criado.data.id;
}

async function atualizarEnderecoContato(id: number, geral: EnderecoBling): Promise<void> {
  const { data } = await bling<{ data: ContatoBling }>(`/contatos/${id}`);
  const atual = data.endereco?.geral || {};
  const so = (v?: string) => String(v || '').replace(/\D/g, '');
  if (so(atual.cep) === geral.cep && String(atual.numero || '').trim() === geral.numero) return;
  // PUT substitui o cadastro inteiro: reenvia o que já existe e troca só o endereço principal.
  await bling(`/contatos/${id}`, {
    method: 'PUT',
    body: { ...data, endereco: { ...data.endereco, geral } },
  });
}

// ---------------- Produtos ----------------

type ProdutoBling = { id: number; codigo?: string; estoque?: { saldoVirtualTotal?: number | string } };

// A API v3 filtra por saldo e, segundo a documentação, o padrão é "só saldo positivo".
// Para enxergar também os produtos zerados e negativos, consultamos os três filtros.
const FILTROS_SALDO = [1, 0, 2] as const;
// "T" (todos) e "V" (variações): garante que as variações (tamanhos) apareçam.
const TIPOS_PRODUTO = ['T', 'V'] as const;

/** Mapa SKU → ID do produto no Bling, consultando por GET /produtos?codigos[]=. */
async function idsPorCodigo(codigos: string[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const falta = new Set(codigos.filter(Boolean));
  for (const tipo of TIPOS_PRODUTO) {
    for (const filtro of FILTROS_SALDO) {
      if (!falta.size) return ids;
      const r = await bling<{ data: ProdutoBling[] }>(
        `/produtos?criterio=2&tipo=${tipo}&filtroSaldoEstoque=${filtro}&limite=100&${lista('codigos', [...falta])}`
      );
      for (const p of r.data || []) {
        if (p.codigo && falta.has(p.codigo)) {
          ids.set(p.codigo, p.id);
          falta.delete(p.codigo);
        }
      }
    }
  }
  return ids;
}

// ---------------- Forma de pagamento ----------------

/**
 * Procura no Bling uma forma de pagamento ativa do tipo usado no pedido
 * (17 = Pix dinâmico, 15 = boleto, 3 = cartão de crédito). Vai para as parcelas
 * do pedido e, daí, para o grupo de pagamento da NF-e. Se não houver, o Bling usa o padrão dele.
 */
async function formaPagamentoId(pedido: WcPedido): Promise<number | undefined> {
  const metodo = `${pedido.payment_method} ${pedido.payment_method_title}`.toLowerCase();
  const tipo = metodo.includes('pix') ? 17 : metodo.includes('boleto') ? 15 : 3;
  try {
    const r = await bling<{ data: { id: number; padrao?: number }[] }>(
      `/formas-pagamentos?situacao=1&${lista('tiposPagamentos', [tipo])}`
    );
    const formas = r.data || [];
    return (formas.find((f) => f.padrao === 1) || formas[0])?.id;
  } catch {
    return undefined;
  }
}

// ---------------- Pedido de venda ----------------

export type ResultadoPedidoVenda = { id: number; numero?: number; jaExistia?: boolean; avisos: string[] };

export async function criarPedidoVenda(pedido: WcPedido): Promise<ResultadoPedidoVenda> {
  const numeroLoja = String(pedido.id);

  // Idempotência: se uma tentativa anterior criou o pedido mas não conseguiu gravar o ID
  // no WooCommerce, reaproveita em vez de duplicar.
  const filtroLoja = config.bling.lojaId ? `&idLoja=${config.bling.lojaId}` : '';
  const ja = await bling<{ data: { id: number; numero?: number; numeroLoja?: string }[] }>(
    `/pedidos/vendas?${lista('numerosLojas', [numeroLoja])}${filtroLoja}`
  );
  const existente = ja.data?.find((p) => p.numeroLoja === numeroLoja);
  if (existente) return { id: existente.id, numero: existente.numero, jaExistia: true, avisos: [] };

  const avisos: string[] = [];
  const ids = await idsPorCodigo(pedido.line_items.map((i) => i.sku));
  const semCadastro = pedido.line_items.filter((i) => !i.sku || !ids.has(i.sku)).map((i) => i.sku || `${i.name} (sem SKU)`);
  if (semCadastro.length) {
    const msg = `SKU sem cadastro no Bling: ${semCadastro.join(', ')}`;
    // Sem o vínculo com o produto, a NF-e sairia sem NCM/dados fiscais e seria rejeitada.
    if (config.bling.emitirNfe) {
      throw new Error(`${msg}. Cadastre o produto no Bling com esse código; o pedido será enviado na próxima rodada.`);
    }
    avisos.push(msg);
  }

  const contatoId = await obterOuCriarContato(pedido, avisos);
  const end = enderecoEntrega(pedido);
  const data = dataBrasil(pedido.date_created_gmt);

  const itens = pedido.line_items.map((item) => {
    const produtoId = item.sku ? ids.get(item.sku) : undefined;
    return {
      codigo: item.sku || undefined,
      descricao: item.name,
      unidade: 'UN',
      quantidade: item.quantity,
      // total já inclui descontos de cupom, então o valor unitário fica correto
      valor: arred(Number(item.total) / item.quantity),
      ...(produtoId ? { produto: { id: produtoId } } : {}),
    };
  });

  // Fecha o total do Bling com o total pago no site: diferenças de arredondamento,
  // descontos fora dos itens (ex.: desconto do Pix como taxa negativa) ou taxas extras.
  const totalItens = arred(itens.reduce((s, i) => s + i.valor * i.quantidade, 0));
  const frete = arred(Number(pedido.shipping_total || 0));
  const total = arred(Number(pedido.total));
  const diferenca = arred(total - totalItens - frete);

  const forma = await formaPagamentoId(pedido);
  const freteLinha = pedido.shipping_lines?.[0];

  const r = await bling<{ data: { id: number; numero?: number } }>('/pedidos/vendas', {
    method: 'POST',
    body: {
      numeroLoja,
      data,
      dataSaida: data,
      dataPrevista: data,
      contato: { id: contatoId },
      ...(config.bling.lojaId ? { loja: { id: Number(config.bling.lojaId) } } : {}),
      itens,
      ...(diferenca < 0 ? { desconto: { valor: -diferenca, unidade: 'REAL' } } : {}),
      ...(diferenca > 0 ? { outrasDespesas: diferenca } : {}),
      ...(forma
        ? {
            parcelas: [
              {
                dataVencimento: data,
                valor: total,
                observacoes: pedido.payment_method_title,
                formaPagamento: { id: forma },
              },
            ],
          }
        : {}),
      transporte: {
        fretePorConta: 0, // CIF: frete contratado pela loja (remetente)
        frete,
        quantidadeVolumes: 1,
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
      observacoes: freteLinha ? `Frete: ${freteLinha.method_title}` : '',
      observacoesInternas: `Pedido #${pedido.id} do site — ${pedido.payment_method_title}`,
    },
  });
  return { id: r.data.id, numero: r.data.numero, avisos };
}

// ---------------- NF-e ----------------

/**
 * Gera a NF-e (ainda não enviada) a partir do pedido de venda. Se o pedido já tem nota
 * (gerada antes ou à mão no Bling), devolve a existente em vez de criar outra.
 */
export async function gerarNfe(idPedidoVenda: number): Promise<number> {
  const venda = await bling<{ data: { notaFiscal?: { id?: number } | null } }>(`/pedidos/vendas/${idPedidoVenda}`);
  const existente = venda.data?.notaFiscal?.id;
  if (existente) return existente;

  // Resposta documentada: 201 { data: { idNotaFiscal } } (aceita variações por segurança)
  const gerada = await bling<{ idNotaFiscal?: number; data?: { idNotaFiscal?: number; id?: number } }>(
    `/pedidos/vendas/${idPedidoVenda}/gerar-nfe`,
    { method: 'POST' }
  );
  const idNota = gerada.data?.idNotaFiscal ?? gerada.data?.id ?? gerada.idNotaFiscal;
  if (!idNota) throw new Error('Bling não retornou o ID da NF-e gerada.');
  return idNota;
}

/** Envia a NF-e para a SEFAZ (POST /nfe/{id}/enviar). O e-mail ao cliente fica com o WooCommerce. */
export async function enviarNfe(idNota: number): Promise<void> {
  await bling(`/nfe/${idNota}/enviar?enviarEmail=false`, { method: 'POST' });
}

const SITUACOES_NFE: Record<number, string> = {
  1: 'Pendente',
  2: 'Cancelada',
  3: 'Aguardando recibo',
  4: 'Rejeitada',
  5: 'Autorizada',
  6: 'Emitida DANFE',
  7: 'Registrada',
  8: 'Aguardando protocolo',
  9: 'Denegada',
  10: 'Consulta situação',
  11: 'Bloqueada',
};

export type SituacaoNfe = {
  situacao: number;
  descricao: string;
  numero?: string;
  chaveAcesso?: string;
  /** Autorizada pela SEFAZ (5 = Autorizada, 6 = Emitida DANFE). */
  autorizada: boolean;
  /** Precisa de ação no Bling (rejeitada, denegada, cancelada, bloqueada). */
  comProblema: boolean;
};

/** Consulta a NF-e (GET /nfe/{id}). A chave de acesso existe antes da autorização, por isso olhamos a situação. */
export async function consultarNfe(idNota: number): Promise<SituacaoNfe> {
  const r = await bling<{ data: { situacao: number; numero?: string; chaveAcesso?: string } }>(`/nfe/${idNota}`);
  const situacao = Number(r.data?.situacao);
  return {
    situacao,
    descricao: SITUACOES_NFE[situacao] || `situação ${situacao}`,
    numero: r.data?.numero,
    chaveAcesso: r.data?.chaveAcesso || undefined,
    autorizada: situacao === 5 || situacao === 6,
    comProblema: [2, 4, 9, 11].includes(situacao),
  };
}

// ---------------- Estoque ----------------

/**
 * Mapa código (SKU) → saldo virtual (já descontando reservas) dos produtos ativos do Bling.
 * Produtos zerados ou negativos entram com 0, para o WooCommerce também zerar.
 */
export async function saldosPorCodigo(): Promise<Map<string, number>> {
  const produtos = new Map<string, { id: number; saldo?: number }>();
  for (const tipo of TIPOS_PRODUTO) {
    for (const filtro of FILTROS_SALDO) {
      for (let pagina = 1; pagina <= 50; pagina++) {
        const r = await bling<{ data: ProdutoBling[] }>(
          `/produtos?pagina=${pagina}&limite=100&criterio=2&tipo=${tipo}&filtroSaldoEstoque=${filtro}`
        );
        for (const p of r.data || []) {
          if (!p.codigo || produtos.has(p.codigo)) continue;
          const s = p.estoque?.saldoVirtualTotal;
          const saldo = s !== undefined && s !== null && s !== '' ? Number(s) : filtro === 1 ? undefined : 0;
          produtos.set(p.codigo, { id: p.id, saldo });
        }
        if (!r.data || r.data.length < 100) break;
      }
    }
  }

  // Quem veio sem o saldo na listagem é consultado em GET /estoques/saldos?idsProdutos[]=
  const semSaldo = [...produtos.values()].filter((p) => p.saldo === undefined);
  for (let i = 0; i < semSaldo.length; i += 50) {
    const lote = semSaldo.slice(i, i + 50);
    const r = await bling<{ data: { produto: { id: number }; saldoVirtualTotal: number }[] }>(
      `/estoques/saldos?${lista('idsProdutos', lote.map((p) => p.id))}`
    );
    for (const s of r.data || []) {
      const p = lote.find((x) => x.id === s.produto?.id);
      if (p) p.saldo = Number(s.saldoVirtualTotal) || 0;
    }
  }

  const saldos = new Map<string, number>();
  for (const [codigo, p] of produtos) {
    // Sem saldo conhecido: não mexe (melhor deixar como está do que zerar por engano)
    if (p.saldo !== undefined && Number.isFinite(p.saldo)) saldos.set(codigo, Math.max(0, Math.floor(p.saldo)));
  }
  return saldos;
}
