// Integração com o Melhor Envio: cria o envio no carrinho, compra e gera a etiqueta,
// e consulta o código de rastreio.
import { config } from './config';
import { documentoCliente, enderecoEntrega, meta, WcPedido } from './woocommerce';

function base(): string {
  return config.melhorEnvio.sandbox ? 'https://sandbox.melhorenvio.com.br/api/v2' : 'https://www.melhorenvio.com.br/api/v2';
}

async function me<T = unknown>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!config.melhorEnvio.token) throw new Error('MELHOR_ENVIO_TOKEN não configurado.');
  const res = await fetch(`${base()}${caminho}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${config.melhorEnvio.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': config.melhorEnvio.userAgent,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const texto = await res.text();
  let json: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    // resposta não-JSON (ex.: página de erro)
  }
  if (!res.ok) {
    const erros = json.errors ? Object.values(json.errors).flat().join('; ') : '';
    throw new Error(`Melhor Envio ${res.status} em ${caminho}: ${erros || json.message || texto.slice(0, 200)}`);
  }
  return json as T;
}

function remetente() {
  const r = config.melhorEnvio.remetente;
  const faltando = (['telefone', 'email', 'endereco', 'numero', 'bairro', 'cidade', 'uf', 'cep'] as const).filter((k) => !r[k]);
  if (!r.documento && !r.cnpj) faltando.push('cpf ou cnpj' as never);
  if (faltando.length) throw new Error(`Dados do remetente faltando: ${faltando.join(', ')} (variáveis REMETENTE_* / CEP_ORIGEM).`);
  return {
    name: r.nome,
    phone: r.telefone,
    email: r.email,
    ...(r.cnpj ? { company_document: r.cnpj, state_register: r.ie } : { document: r.documento }),
    address: r.endereco,
    number: r.numero,
    complement: r.complemento || '',
    district: r.bairro,
    city: r.cidade,
    state_abbr: r.uf,
    country_id: 'BR',
    postal_code: r.cep!.replace(/\D/g, ''),
  };
}

/** ID do serviço escolhido no checkout (ex.: 1 = Correios PAC, 2 = SEDEX). */
export function servicoDoPedido(pedido: WcPedido): number | null {
  const id = Number(meta(pedido, '_sv_melhorenvio_servico'));
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Adiciona o envio ao carrinho do Melhor Envio. Retorna o ID do envio. */
export async function criarEnvio(pedido: WcPedido, chaveNfe?: string): Promise<string> {
  const servico = servicoDoPedido(pedido);
  if (!servico) throw new Error('Pedido sem serviço de frete do Melhor Envio (_sv_melhorenvio_servico).');

  const end = enderecoEntrega(pedido);
  const doc = documentoCliente(pedido);
  const pecas = pedido.line_items.reduce((s, i) => s + i.quantity, 0);
  const valorProdutos = pedido.line_items.reduce((s, i) => s + Number(i.total), 0);
  const { caixa, pesoPorPecaKg } = config.melhorEnvio;

  const r = await me<{ id: string }>('/me/cart', {
    method: 'POST',
    body: {
      service: servico,
      from: remetente(),
      to: {
        name: end.nome,
        phone: (pedido.billing.phone || '').replace(/\D/g, ''),
        email: pedido.billing.email,
        ...(doc.length === 14 ? { company_document: doc } : { document: doc }),
        address: end.rua,
        number: end.numero,
        complement: end.complemento,
        district: end.bairro,
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
      volumes: [
        {
          height: caixa.altura,
          width: caixa.largura,
          length: caixa.comprimento,
          weight: Number((pecas * pesoPorPecaKg).toFixed(3)),
        },
      ],
      options: {
        insurance_value: Number(valorProdutos.toFixed(2)),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: !chaveNfe,
        ...(chaveNfe ? { invoice: { key: chaveNfe } } : {}),
        platform: config.lojaNome,
        tags: [{ tag: `Pedido #${pedido.id}`, url: null }],
      },
    },
  });
  return r.id;
}

/** Paga a etiqueta com o saldo da carteira, gera e devolve o link para impressão. */
export async function comprarEtiqueta(idEnvio: string): Promise<string> {
  await me('/me/shipment/checkout', { method: 'POST', body: { orders: [idEnvio] } });
  await me('/me/shipment/generate', { method: 'POST', body: { orders: [idEnvio] } });
  const impressao = await me<{ url: string }>('/me/shipment/print', {
    method: 'POST',
    body: { mode: 'public', orders: [idEnvio] },
  });
  return impressao.url;
}

/** Código de rastreio do envio, se já existir (aparece depois da postagem). */
export async function rastreio(idEnvio: string): Promise<{ codigo: string | null; status: string }> {
  const r = await me<{ tracking?: string | null; self_tracking?: string | null; status: string }>(`/me/orders/${idEnvio}`);
  return { codigo: r.tracking || r.self_tracking || null, status: r.status };
}

export function linkRastreio(codigo: string): string {
  return `https://www.melhorrastreio.com.br/rastreio/${codigo}`;
}
