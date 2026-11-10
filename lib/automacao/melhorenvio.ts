// Integração com o Melhor Envio (a cotação fica em lib/frete.ts): pacote, envio no carrinho, compra e geração da etiqueta,
// rastreio e webhooks.
//
// Os payloads seguem a referência da API v2 (docs.melhorenvio.com.br) e o plugin oficial do
// Melhor Envio para WooCommerce (github.com/melhorenvio/wp-melhorenvio-v2), que usa as mesmas rotas.
import crypto from 'node:crypto';
import { config } from './config';
import { documentoCliente, enderecoEntrega, meta, WcPedido } from './woocommerce';

/** Serviços dos Correios (PAC, SEDEX, Mini Envios). Para eles o carrinho aceita um único volume. */
const SERVICOS_CORREIOS = [1, 2, 17];

/** Status de envio que já saiu para a transportadora. */
const STATUS_POSTADO = ['posted', 'delivered', 'undelivered', 'paused', 'suspended'];

export function base(): string {
  return config.melhorEnvio.sandbox ? 'https://sandbox.melhorenvio.com.br/api/v2' : 'https://melhorenvio.com.br/api/v2';
}

export async function me<T = unknown>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!config.melhorEnvio.token) throw new Error('MELHOR_ENVIO_TOKEN não configurado.');
  const res = await fetch(`${base()}${caminho}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${config.melhorEnvio.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // O Melhor Envio exige "Nome da aplicação (e-mail de contato)".
      'User-Agent': config.melhorEnvio.userAgent,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const texto = await res.text();
  let json: any = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    json = { message: texto.slice(0, 200) };
  }
  if (!res.ok) {
    const erros = json.errors ? Object.values(json.errors).flat().join('; ') : '';
    throw new Error(`Melhor Envio ${res.status} em ${caminho}: ${erros || json.error || json.message || texto.slice(0, 200)}`);
  }
  return json as T;
}

// ---------------- Pacote (mesmos valores na cotação e na etiqueta) ----------------

/** Caixa e peso do pacote para uma quantidade de peças. Medidas em cm, peso em kg. */
export function pacote(pecas: number) {
  const { caixa, pesoPorPecaKg, pesoCaixaKg } = config.melhorEnvio;
  const qtd = Math.max(1, pecas);
  return {
    height: caixa.altura,
    width: caixa.largura,
    length: caixa.comprimento,
    weight: Number((qtd * pesoPorPecaKg + pesoCaixaKg).toFixed(3)),
  };
}

// ---------------- Envio (carrinho) ----------------

function soDigitos(v?: string): string {
  return (v || '').replace(/\D/g, '');
}

function remetente() {
  const r = config.melhorEnvio.remetente;
  const faltando: string[] = (['telefone', 'email', 'endereco', 'numero', 'bairro', 'cidade', 'uf', 'cep'] as const).filter((k) => !r[k]);
  if (!r.documento && !r.cnpj) faltando.push('cpf ou cnpj');
  if (faltando.length) throw new Error(`Dados do remetente faltando: ${faltando.join(', ')} (variáveis REMETENTE_* / CEP_ORIGEM).`);
  return {
    name: r.nome,
    phone: soDigitos(r.telefone),
    email: r.email,
    ...(r.cnpj
      ? { company_document: soDigitos(r.cnpj), state_register: r.ie || null }
      : { document: soDigitos(r.documento) }),
    address: r.endereco,
    number: r.numero,
    complement: r.complemento || '',
    district: r.bairro,
    city: r.cidade,
    state_abbr: r.uf,
    country_id: 'BR',
    postal_code: soDigitos(r.cep),
  };
}

/** ID do serviço escolhido no checkout (ex.: 1 = Correios PAC, 2 = SEDEX). */
export function servicoDoPedido(pedido: WcPedido): number | null {
  const id = Number(meta(pedido, '_sv_melhorenvio_servico'));
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Tag gravada no envio. O webhook usa ela para achar o pedido do WooCommerce. */
function tagPedido(id: number): string {
  return `Pedido #${id}`;
}

export function pedidoDaTag(tags: unknown): number | null {
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    const m = String((t as { tag?: unknown })?.tag ?? '').match(/Pedido #(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Adiciona o envio ao carrinho do Melhor Envio. Retorna o ID do envio. */
export async function criarEnvio(pedido: WcPedido, chaveNfe?: string): Promise<string> {
  const servico = servicoDoPedido(pedido);
  if (!servico) throw new Error('Pedido sem serviço de frete do Melhor Envio (_sv_melhorenvio_servico).');

  const end = enderecoEntrega(pedido);
  const doc = documentoCliente(pedido);
  if (!end.cep || !end.rua || !end.cidade || !end.uf) throw new Error('Endereço de entrega incompleto no pedido.');
  const pecas = pedido.line_items.reduce((s, i) => s + i.quantity, 0);
  const valorProdutos = pedido.line_items.reduce((s, i) => s + Number(i.total), 0);
  const volume = pacote(pecas);
  const agencia = config.melhorEnvio.agencias[servico];

  const r = await me<{ id: string; protocol?: string }>('/me/cart', {
    method: 'POST',
    body: {
      service: servico,
      ...(agencia ? { agency: agencia } : {}),
      from: remetente(),
      to: {
        name: end.nome,
        phone: soDigitos(pedido.billing.phone),
        email: pedido.billing.email,
        ...(doc.length === 14 ? { company_document: doc } : { document: doc }),
        address: end.rua,
        number: end.numero,
        complement: end.complemento,
        district: end.bairro || 'N/I',
        city: end.cidade,
        state_abbr: end.uf,
        country_id: 'BR',
        postal_code: end.cep,
      },
      products: pedido.line_items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitary_value: Number((Number(i.total) / i.quantity).toFixed(2)),
      })),
      // Correios aceitam um único volume (objeto); as outras transportadoras recebem uma lista.
      volumes: SERVICOS_CORREIOS.includes(servico) ? volume : [volume],
      options: {
        insurance_value: Number(valorProdutos.toFixed(2)),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: !chaveNfe,
        ...(chaveNfe ? { invoice: { key: chaveNfe } } : {}),
        platform: config.lojaNome,
        tags: [{ tag: tagPedido(pedido.id), url: `${config.woo.url}/wp-admin/post.php?post=${pedido.id}&action=edit` }],
      },
    },
  });
  if (!r?.id) throw new Error('Melhor Envio não devolveu o ID do envio.');
  return r.id;
}

// ---------------- Etiqueta ----------------

type EnvioME = {
  id: string;
  status: string;
  tracking?: string | null;
  self_tracking?: string | null;
  protocol?: string;
  tags?: { tag: string; url: string | null }[];
};

export async function consultarEnvio(idEnvio: string): Promise<EnvioME> {
  return me<EnvioME>(`/me/orders/${idEnvio}`);
}

/**
 * Paga a etiqueta com o saldo da carteira, gera e devolve o link para impressão.
 * Pode ser chamada de novo depois de uma falha: pula o que já foi feito.
 */
export async function comprarEtiqueta(idEnvio: string): Promise<string> {
  let envio = await consultarEnvio(idEnvio);
  if (envio.status === 'canceled' || envio.status === 'expired') {
    throw new Error(`Envio ${idEnvio} está ${envio.status} no Melhor Envio.`);
  }

  if (envio.status === 'pending') {
    // Sem saldo suficiente, o Melhor Envio responde erro e nada é cobrado.
    await me('/me/shipment/checkout', { method: 'POST', body: { orders: [idEnvio] } });
    envio = await consultarEnvio(idEnvio);
  }

  if (envio.status === 'released') {
    const g = await me<Record<string, { status?: boolean; message?: string }>>('/me/shipment/generate', {
      method: 'POST',
      body: { orders: [idEnvio] },
    });
    const resultado = g?.[idEnvio];
    if (resultado && resultado.status === false) {
      throw new Error(`Etiqueta paga, mas não foi gerada: ${resultado.message || 'erro desconhecido'}`);
    }
  }

  const impressao = await me<{ url: string }>('/me/shipment/print', {
    method: 'POST',
    body: { mode: 'public', orders: [idEnvio] },
  });
  if (!impressao?.url) throw new Error('Melhor Envio não devolveu o link de impressão da etiqueta.');
  return impressao.url;
}

// ---------------- Rastreio ----------------

/**
 * Código de rastreio do envio, se a encomenda já foi postada.
 * O self_tracking (código "ME...") existe desde o carrinho, então só vale depois da postagem;
 * antes disso o cliente seria avisado de um envio que ainda nem foi pago.
 */
export function codigoDoEnvio(envio: Pick<EnvioME, 'status' | 'tracking' | 'self_tracking'>): string | null {
  if (envio.tracking) return envio.tracking;
  if (STATUS_POSTADO.includes(envio.status) && envio.self_tracking) return envio.self_tracking;
  return null;
}

export async function rastreio(idEnvio: string): Promise<{ codigo: string | null; status: string }> {
  const r = await consultarEnvio(idEnvio);
  return { codigo: codigoDoEnvio(r), status: r.status };
}

export function linkRastreio(codigo: string): string {
  return `https://www.melhorrastreio.com.br/rastreio/${codigo}`;
}

// ---------------- Webhook ----------------

/** Valida o header X-ME-Signature: HMAC-SHA256 (base64) do corpo bruto com o client secret do aplicativo. */
export function assinaturaWebhookValida(corpo: string, assinatura: string | null): boolean {
  const segredo = config.melhorEnvio.webhookSecret;
  if (!segredo || !assinatura) return false;
  const esperada = crypto.createHmac('sha256', segredo).update(corpo, 'utf8').digest('base64');
  const a = Buffer.from(esperada);
  const b = Buffer.from(assinatura.trim().replace(/^sha256=/, ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
