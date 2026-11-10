import { NextResponse } from 'next/server';
import { cotarFrete, freteGratis } from '../../../lib/frete';
import { metaDadosRastreio } from '../../../lib/automacao/meta';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Formas de pagamento aceitas (IDs dos gateways AppMax no WooCommerce) e desconto de cada uma.
const METODOS: Record<string, { titulo: string; desconto: number }> = {
  appmax_pix: { titulo: 'Pix -- AppMax', desconto: 0.1 },
  appmax_credit: { titulo: 'Cartão de Crédito -- AppMax', desconto: 0 },
};

const MAX_ITENS = 20;
const MAX_QTD_POR_ITEM = 20;

const centavos = (v: number) => Math.round(v * 100) / 100;

type ProdutoWc = {
  id: number;
  parent_id?: number;
  name: string;
  status: string;
  price: string;
  purchasable: boolean;
  stock_status: string;
};

class ErroCheckout extends Error {}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cliente, items, shipping, paymentMethod } = body;
    const listaItens = items || body.itens;

    if (!listaItens || !Array.isArray(listaItens) || listaItens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'O carrinho está vazio ou os itens não foram enviados.' },
        { status: 400 }
      );
    }
    if (listaItens.length > MAX_ITENS) {
      return NextResponse.json({ success: false, error: 'Carrinho com itens demais.' }, { status: 400 });
    }

    const eventId =
      typeof body.eventId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(body.eventId) ? body.eventId : undefined;

    const metodoEscolhido = paymentMethod || 'appmax_pix';
    const metodo = METODOS[metodoEscolhido];
    if (!metodo) {
      return NextResponse.json({ success: false, error: 'Forma de pagamento inválida.' }, { status: 400 });
    }

    const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const clienteFinal = {
      nome: txt(cliente?.nome),
      email: txt(cliente?.email),
      telefone: txt(cliente?.telefone),
      numeroDocumento: txt(cliente?.numeroDocumento),
      endereco: txt(cliente?.endereco),
      numero: txt(cliente?.numero) || 'S/N',
      bairro: txt(cliente?.bairro),
      cidade: txt(cliente?.cidade),
      cep: txt(cliente?.cep),
      uf: txt(cliente?.uf) || 'RJ',
    };

    const documentoValido = [11, 14].includes(clienteFinal.numeroDocumento.replace(/\D/g, '').length);
    const cepValido = clienteFinal.cep.replace(/\D/g, '').length === 8;
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteFinal.email);
    if (
      !clienteFinal.nome ||
      !emailValido ||
      !documentoValido ||
      !cepValido ||
      !clienteFinal.endereco ||
      !clienteFinal.bairro ||
      !clienteFinal.cidade
    ) {
      return NextResponse.json(
        { success: false, error: 'Preencha nome, e-mail, CPF/CNPJ e endereço completo com CEP válido.' },
        { status: 400 }
      );
    }

    // Agrupa por produto/variação e valida quantidades (o navegador só informa ID e quantidade).
    const quantidades = new Map<number, number>();
    for (const item of listaItens) {
      const id = Number(item?.id);
      const qtd = Number(item?.quantity ?? item?.quantidade ?? 1);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qtd) || qtd < 1 || qtd > MAX_QTD_POR_ITEM) {
        return NextResponse.json({ success: false, error: 'Item do carrinho inválido.' }, { status: 400 });
      }
      quantidades.set(id, (quantidades.get(id) || 0) + qtd);
    }

    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      return NextResponse.json(
        { success: false, error: 'Credenciais do WooCommerce não configuradas no servidor.' },
        { status: 500 }
      );
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const partesNome = clienteFinal.nome.trim().split(' ');
    const firstName = partesNome[0] || 'Cliente';
    const lastName = partesNome.slice(1).join(' ') || 'Da Loja';
    const documentoLimpo = clienteFinal.numeroDocumento.replace(/\D/g, '');
    const cepLimpo = clienteFinal.cep.replace(/\D/g, '');
    const enderecoCompleto = `${clienteFinal.endereco}, ${clienteFinal.numero} - ${clienteFinal.bairro}`;

    // 💰 PREÇOS DO SERVIDOR: busca o preço atual de cada produto/variação no WooCommerce.
    // O preço enviado pelo navegador é ignorado; o desconto do Pix é aplicado aqui.
    const produtos = await Promise.all(
      [...quantidades.keys()].map(async (id) => {
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${id}`, {
          headers: { Authorization: authHeader, Accept: 'application/json' },
          cache: 'no-store',
        });
        if (res.status === 404) throw new ErroCheckout('Um dos produtos do carrinho não existe mais. Atualize a sacola.');
        if (!res.ok) throw new Error(`WooCommerce ${res.status} ao consultar o produto ${id}`);
        return (await res.json()) as ProdutoWc;
      })
    );

    let subtotalProdutos = 0;
    const lineItems = produtos.map((p) => {
      const preco = Number(p.price);
      if (p.status !== 'publish' || !p.purchasable || p.stock_status === 'outofstock' || !(preco > 0)) {
        throw new ErroCheckout(`"${p.name}" não está disponível para compra no momento.`);
      }
      const quantity = quantidades.get(p.id)!;
      const cheio = centavos(preco * quantity);
      const comDesconto = centavos(cheio * (1 - metodo.desconto));
      subtotalProdutos += comDesconto;
      const parentId = Number(p.parent_id || 0);
      return {
        product_id: parentId > 0 ? parentId : p.id,
        ...(parentId > 0 && { variation_id: p.id }),
        quantity,
        // subtotal = preço cheio; total = com desconto. O WooCommerce mostra a diferença como desconto.
        subtotal: cheio.toFixed(2),
        total: comDesconto.toFixed(2),
      };
    });
    subtotalProdutos = centavos(subtotalProdutos);

    // 🚚 FRETE DO SERVIDOR: refaz a cotação no Melhor Envio e usa o preço dela, não o do navegador.
    const servicoId = Number(shipping?.id);
    if (!Number.isInteger(servicoId) || servicoId <= 0) {
      return NextResponse.json({ success: false, error: 'Calcule e escolha o frete antes de finalizar.' }, { status: 400 });
    }
    const cotacoes = await cotarFrete(
      cepLimpo,
      produtos.map((p) => ({ quantity: quantidades.get(p.id)!, price: Number(p.price) }))
    );
    const cotacao = cotacoes.find((c) => c.id === servicoId);
    if (!cotacao) {
      return NextResponse.json(
        { success: false, error: 'A opção de frete escolhida não está mais disponível. Calcule o frete de novo.' },
        { status: 400 }
      );
    }
    const gratis = freteGratis(cotacao, subtotalProdutos);
    const valorFrete = gratis ? 0 : centavos(cotacao.price);

    // 🛍️ PEDIDO CRIADO COMO CONVIDADO (Garante acesso direto à chave de pagamento sem login)
    const wcOrderPayload: any = {
      customer_id: 0,
      payment_method: metodoEscolhido,
      payment_method_title: metodo.titulo,
      set_paid: false,
      billing: {
        first_name: firstName,
        last_name: lastName,
        address_1: enderecoCompleto,
        city: clienteFinal.cidade,
        state: clienteFinal.uf,
        postcode: cepLimpo,
        country: 'BR',
        email: clienteFinal.email,
        phone: clienteFinal.telefone,
      },
      shipping: {
        first_name: firstName,
        last_name: lastName,
        address_1: enderecoCompleto,
        city: clienteFinal.cidade,
        state: clienteFinal.uf,
        postcode: cepLimpo,
        country: 'BR',
      },
      line_items: lineItems,
      shipping_lines: [
        {
          method_id: 'flat_rate',
          method_title: gratis ? `${cotacao.name} (FRETE GRÁTIS)` : cotacao.name,
          total: valorFrete.toFixed(2),
        },
      ],
      meta_data: [
        { key: '_billing_cpf', value: documentoLimpo },
        { key: 'cpf', value: documentoLimpo },
        { key: '_billing_phone', value: clienteFinal.telefone },
        // Usados pelas automações (etiqueta do Melhor Envio, NF-e no Bling)
        { key: '_billing_number', value: clienteFinal.numero },
        { key: '_billing_neighborhood', value: clienteFinal.bairro },
        { key: '_sv_melhorenvio_servico', value: String(cotacao.id) },
        // Meta Ads: cookies do Pixel, IP e navegador, usados no evento Purchase quando o pagamento for aprovado
        ...metaDadosRastreio(request, eventId),
      ]
    };

    const wcResponse = await fetch(`${wcUrl}/wp-json/wc/v3/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(wcOrderPayload),
    });

    const wcData = await wcResponse.json();

    if (!wcResponse.ok) {
      return NextResponse.json(
        { success: false, error: wcData.message || 'Erro ao registrar pedido no WooCommerce.' },
        { status: wcResponse.status || 400 }
      );
    }

    let paymentUrl = wcData.payment_url;

    if (wcData.meta_data && Array.isArray(wcData.meta_data)) {
      const gatewayUrlMeta = wcData.meta_data.find(
        (m: any) =>
          m.key === '_appmax_payment_url' ||
          m.key === 'payment_url' ||
          m.key === '_payment_url' ||
          m.key === 'payment_link' ||
          m.key === 'appmax_url'
      );
      if (gatewayUrlMeta && gatewayUrlMeta.value) {
        paymentUrl = gatewayUrlMeta.value;
      }
    }

    if (!paymentUrl || paymentUrl.includes('order-pay')) {
      const wpBaseUrl = process.env.WP_BACKEND_URL || wcUrl;
      paymentUrl = `${wpBaseUrl}/finalizar-compra/order-pay/${wcData.id}/?pay_for_order=true&key=${wcData.order_key}`;
    }

    if (paymentUrl.includes('https://sambavest.com/finalizar-compra')) {
      paymentUrl = paymentUrl.replace('https://sambavest.com', wcUrl);
    }

    return NextResponse.json({
      success: true,
      message: 'Pedido gerado com sucesso!',
      paymentUrl,
      orderId: wcData.id,
      total: wcData.total,
    });

  } catch (error: any) {
    if (error instanceof ErroCheckout) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Erro no checkout:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao processar o pedido. Tente novamente em instantes.' },
      { status: 500 }
    );
  }
}