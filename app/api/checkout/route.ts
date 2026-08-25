import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📦 Body bruto recebido na API de Checkout:", JSON.stringify(body, null, 2));

    const { cliente, items, shipping } = body;
    const listaItens = items || body.itens;

    if (!listaItens || !Array.isArray(listaItens) || listaItens.length === 0) {
      console.error("❌ Erro: Lista de itens veio vazia ou indefinida:", body);
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

    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://sambavest.com';
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

    // 🔍 1. APENAS BUSCA O CLIENTE SE EXISTIR (SEM CRIAR CONTA AUTOMÁTICA PARA EVITAR SENHAS)
    let customerId = 0;
    try {
      const searchRes = await fetch(`${wcUrl}/wp-json/wc/v3/customers?email=${encodeURIComponent(clienteFinal.email)}`, {
        headers: { 'Authorization': authHeader },
        cache: 'no-store',
      });
      const existingCustomers = await searchRes.json();

      if (Array.isArray(existingCustomers) && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;
        console.log(`👤 Cliente já existente encontrado no WooCommerce (ID: ${customerId})`);
      }
    } catch (custError) {
      console.warn("⚠️ Aviso ao buscar cliente, prosseguindo como visitante/convidado.", custError);
    }

    // 🛍️ 2. MONTAR O PAYLOAD DO PEDIDO
    const wcOrderPayload: any = {
      payment_method: 'appmax',
      payment_method_title: 'Appmax Pagamentos',
      set_paid: false,
      billing: {
        first_name: firstName,
        last_name: lastName,
        address_1: `${clienteFinal.endereco}, ${clienteFinal.numero} - ${clienteFinal.bairro}`,
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
        address_1: `${clienteFinal.endereco}, ${clienteFinal.numero} - ${clienteFinal.bairro}`,
        city: clienteFinal.cidade,
        state: clienteFinal.uf,
        postcode: cepLimpo,
        country: 'BR',
      },
      line_items: listaItens.map((item: any) => {
        const variationId = Number(item.variation_id || (item.parent_id ? item.id : 0));
        const productId = Number(item.parent_id || item.product_id || (variationId ? 0 : item.id));

        return {
          product_id: productId > 0 ? productId : variationId,
          variation_id: variationId > 0 ? variationId : 0,
          quantity: Number(item.quantity || item.quantidade || 1),
          price: String(item.price || item.valorUnitario || 0),
        };
      }),
      shipping_lines: shipping ? [
        {
          method_id: 'custom_shipping',
          method_title: shipping.method_title || 'Frete',
          total: String(shipping.price || 0)
        }
      ] : [],
      meta_data: [
        {
          key: '_billing_cpf',
          value: documentoLimpo,
        },
        {
          key: 'cpf',
          value: documentoLimpo,
        }
      ]
    };

    if (customerId > 0) {
      wcOrderPayload.customer_id = customerId;
    }

    console.log("🚀 Criando pedido no WooCommerce/Appmax...", JSON.stringify(wcOrderPayload, null, 2));

    const wcResponse = await fetch(`${wcUrl}/wp-json/wc/v3/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(wcOrderPayload),
    });

    const wcData = await wcResponse.json();

    if (!wcResponse.ok) {
      console.error("❌ Erro retornado pela API do WooCommerce:", wcData);
      throw new Error(wcData.message || 'Erro ao criar o pedido no WooCommerce.');
    }

    const paymentUrl = wcData.payment_url || `${wcUrl}/checkout/order-pay/${wcData.id}/?pay_for_order=true`;

    console.log(`✅ Pedido #${wcData.id} criado com sucesso no WooCommerce! URL de pagamento:`, paymentUrl);

    return NextResponse.json({
      success: true,
      message: 'Pedido gerado com sucesso no WooCommerce e pronto para pagamento!',
      paymentUrl: paymentUrl,
      orderId: wcData.id,
    });

  } catch (error: any) {
    console.error('❌ Erro crítico na API de Checkout:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Erro interno ao processar o pedido.' 
      },
      { status: 500 }
    );
  }
}