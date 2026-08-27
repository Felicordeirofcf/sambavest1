import { NextResponse } from 'next/server';
import { Agent } from 'undici';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Configuração do despachante para aceitar certificados SSL autoassinados no runtime Node.js da Vercel
const sslBypassDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📦 Body recebido no Checkout:", JSON.stringify(body, null, 2));

    const { cliente, items, shipping, paymentMethod } = body;
    const listaItens = items || body.itens;

    if (!listaItens || !Array.isArray(listaItens) || listaItens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'O carrinho está vazio ou os itens não foram enviados.' },
        { status: 400 }
      );
    }

    const clienteFinal = {
      nome: cliente?.nome || 'Cliente da Loja',
      email: cliente?.email || 'cliente@email.com',
      telefone: cliente?.telefone || '21999999999',
      numeroDocumento: cliente?.numeroDocumento || '00000000000',
      endereco: cliente?.endereco || 'Endereço não informado',
      numero: cliente?.numero || 'S/N',
      bairro: cliente?.bairro || 'Centro',
      cidade: cliente?.cidade || 'Rio de Janeiro',
      cep: cliente?.cep || '20000000',
      uf: cliente?.uf || 'RJ',
    };

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

    // 🔍 1. BUSCA OU CRIA O CLIENTE NO WOOCOMMERCE
    let customerId = 0;
    try {
      const searchRes = await fetch(`${wcUrl}/wp-json/wc/v3/customers?email=${encodeURIComponent(clienteFinal.email)}`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
        // @ts-ignore - suporte a dispatcher undici no Next.js Server Runtime
        dispatcher: sslBypassDispatcher,
      });

      if (searchRes.ok) {
        const existingCustomers = await searchRes.json();
        if (Array.isArray(existingCustomers) && existingCustomers.length > 0) {
          customerId = existingCustomers[0].id;
        }
      }

      if (customerId === 0) {
        const randomPassword = Math.random().toString(36).slice(-8) + "Aa1@";
        const createCustomerRes = await fetch(`${wcUrl}/wp-json/wc/v3/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          // @ts-ignore
          dispatcher: sslBypassDispatcher,
          body: JSON.stringify({
            email: clienteFinal.email,
            first_name: firstName,
            last_name: lastName,
            password: randomPassword,
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
          }),
        });

        if (createCustomerRes.ok) {
          const newCustomerData = await createCustomerRes.json();
          if (newCustomerData.id) {
            customerId = newCustomerData.id;
          }
        }
      }
    } catch (custError) {
      console.warn("⚠️ Aviso ao buscar/criar cliente, prosseguindo checkout:", custError);
    }

    const metodoEscolhido = paymentMethod || 'appmax_pix';
    const tituloMetodo = metodoEscolhido.includes('pix') ? 'Pix -- AppMax' : 'Cartão de Crédito -- AppMax';

    // 🛍️ 2. MONTAR PAYLOAD DO PEDIDO
    const wcOrderPayload: any = {
      payment_method: metodoEscolhido,
      payment_method_title: tituloMetodo,
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
      line_items: listaItens.map((item: any) => {
        const parentId = Number(item.parent_id);
        const itemId = Number(item.id);

        const productId = parentId > 0 ? parentId : itemId;
        const variationId = parentId > 0 ? itemId : 0;

        return {
          product_id: productId,
          ...(variationId > 0 && { variation_id: variationId }),
          quantity: Number(item.quantity || item.quantidade || 1),
          price: String(item.price || item.valorUnitario || 0),
        };
      }),
      shipping_lines: shipping ? [
        {
          method_id: 'flat_rate',
          method_title: shipping.method_title || 'Frete Correios / Transportadora',
          total: String(shipping.price || 0),
        }
      ] : [],
      meta_data: [
        { key: '_billing_cpf', value: documentoLimpo },
        { key: 'cpf', value: documentoLimpo },
        { key: '_billing_phone', value: clienteFinal.telefone },
      ]
    };

    if (customerId > 0) {
      wcOrderPayload.customer_id = customerId;
    }

    // 🚀 3. ENVIAR PEDIDO AO WOOCOMMERCE
    const wcResponse = await fetch(`${wcUrl}/wp-json/wc/v3/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      // @ts-ignore
      dispatcher: sslBypassDispatcher,
      body: JSON.stringify(wcOrderPayload),
    });

    const wcData = await wcResponse.json();

    if (!wcResponse.ok) {
      console.error("❌ Erro da API do WooCommerce:", wcData);
      return NextResponse.json(
        { success: false, error: wcData.message || 'Erro ao registrar pedido no WooCommerce.' },
        { status: wcResponse.status || 400 }
      );
    }

    // 🔍 4. DEFINIÇÃO DA URL DE PAGAMENTO
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
    });

  } catch (error: any) {
    console.error('❌ Erro crítico na API de Checkout:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erro interno ao processar o pedido.',
      },
      { status: 500 }
    );
  }
}