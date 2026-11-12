import { NextResponse } from 'next/server';
import { cotarFrete, freteGratis } from '../../../lib/frete';
import { dentroDoLimite, ipDe } from '../../../lib/automacao/kv';
import { metaDadosRastreio, metaOrigem } from '../../../lib/automacao/meta';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Formas de pagamento aceitas. A chave é o que o checkout do site envia; `gateway` é o ID real
// do método no WooCommerce (WooCommerce → Configurações → Pagamentos → abrir o método → "&section=ID").
// Se o plugin da AppMax mudar os IDs, ajuste APPMAX_GATEWAY_PIX / APPMAX_GATEWAY_CARTAO na Vercel.
const METODOS: Record<string, { gateway: string; titulo: string; desconto: number }> = {
  appmax_pix: {
    gateway: process.env.APPMAX_GATEWAY_PIX?.trim() || 'pagamentos_para_woocommerce_com_appmax_pix',
    titulo: 'Pix -- AppMax',
    desconto: DESCONTO_PIX_PADRAO, // durante a Black Friday vale descontoPixAtual() = 0
  },
  appmax_credit: {
    gateway: process.env.APPMAX_GATEWAY_CARTAO?.trim() || 'pagamentos_para_woocommerce_com_appmax_credit_card',
    titulo: 'Cartão de Crédito -- AppMax',
    desconto: 0,
  },
};

import { descontoPixAtual, DESCONTO_PIX_PADRAO } from '../../../lib/pix';
import { registrarFalha } from '../../../lib/automacao/monitor';
import { marcarConvertido } from '../../../lib/automacao/abandono';

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
  manage_stock?: boolean | 'parent';
  stock_quantity?: number | null;
  backorders?: string;
};

class ErroCheckout extends Error {}

export async function POST(request: Request) {
  try {
    // Até 10 pedidos a cada 15 minutos por IP: cliente real não chega perto; robô criando
    // pedidos falsos (e disparando lembretes de Pix para terceiros) para aqui.
    if (!(await dentroDoLimite(`checkout:${ipDe(request)}`, 10, 900))) {
      return NextResponse.json(
        { success: false, error: 'Muitas tentativas de pedido. Aguarde alguns minutos ou fale com a gente no WhatsApp.' },
        { status: 429 }
      );
    }
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
    // Pix: 10% fora da Black Friday, 0% durante (o preço já é o da Black)
    const descontoDoMetodo = metodo.desconto > 0 ? descontoPixAtual() : 0;
    const lineItems = produtos.map((p) => {
      const preco = Number(p.price);
      if (p.status !== 'publish' || !p.purchasable || p.stock_status === 'outofstock' || !(preco > 0)) {
        throw new ErroCheckout(`"${p.name}" não está disponível para compra no momento.`);
      }
      const pedida = quantidades.get(p.id)!;
      const controla = p.manage_stock === true || p.manage_stock === 'parent';
      if (controla && p.backorders === 'no' && typeof p.stock_quantity === 'number' && p.stock_quantity < pedida) {
        throw new ErroCheckout(
          p.stock_quantity > 0
            ? `Só temos ${p.stock_quantity} unidade(s) de "${p.name}". Ajuste a quantidade na sacola.`
            : `"${p.name}" acabou de esgotar.`
        );
      }
      const quantity = quantidades.get(p.id)!;
      const cheio = centavos(preco * quantity);
      const comDesconto = centavos(cheio * (1 - descontoDoMetodo));
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
      await registrarFalha('checkout-recusado', 'frete não escolhido');
      return NextResponse.json({ success: false, error: 'Calcule e escolha o frete antes de finalizar.' }, { status: 400 });
    }
    const cotacoes = await cotarFrete(
      cepLimpo,
      produtos.map((p) => ({ quantity: quantidades.get(p.id)!, price: Number(p.price) }))
    );
    const cotacao = cotacoes.find((c) => c.id === servicoId);
    if (!cotacao) {
      await registrarFalha('checkout-recusado', 'frete escolhido não está mais disponível');
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
      payment_method: metodo.gateway,
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
        ...metaOrigem(body.origem, request),
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
      await registrarFalha('checkout-erro', `WooCommerce ${wcResponse.status}: ${wcData?.message || ''}`);
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

    // Quem finalizou deixa de receber lembrete de carrinho abandonado
    await marcarConvertido(String(clienteFinal.email || ''), Number(wcData.id));

    return NextResponse.json({
      success: true,
      message: 'Pedido gerado com sucesso!',
      paymentUrl,
      orderId: wcData.id,
      total: wcData.total,
    });

  } catch (error: any) {
    if (error instanceof ErroCheckout) {
      await registrarFalha('checkout-recusado', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Erro no checkout:', error);
    await registrarFalha('checkout-erro', error?.message || String(error));
    return NextResponse.json(
      { success: false, error: 'Erro interno ao processar o pedido. Tente novamente em instantes.' },
      { status: 500 }
    );
  }
}