import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📦 Body bruto recebido na API de Checkout:", JSON.stringify(body, null, 2));

    const { cliente, items, shipping, paymentMethod } = body;
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

    // wcUrl é a URL da API do WooCommerce (geralmente onde ele está hospedado agora)
    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://painel.sambavest.com';
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

    const enderecoCompleto = clienteFinal.endereco + ', ' + clienteFinal.numero + ' - ' + clienteFinal.bairro;

    // 🔍 1. BUSCA OU CRIA O CLIENTE NO WOOCOMMERCE
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
      } else {
        // 🆕 CLIENTE NÃO EXISTE: CRIAR NOVA CONTA COM SENHA AUTOMÁTICA
        const randomPassword = Math.random().toString(36).slice(-8) + "Aa1@"; 
        
        const newCustomerPayload = {
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
          }
        };

        const createCustomerRes = await fetch(`${wcUrl}/wp-json/wc/v3/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify(newCustomerPayload),
        });

        const newCustomerData = await createCustomerRes.json();
        
        if (createCustomerRes.ok && newCustomerData.id) {
          customerId = newCustomerData.id;
          console.log(`🆕 Nova conta criada no WooCommerce para o e-mail ${clienteFinal.email} (ID: ${customerId})`);
        } else {
          console.error("❌ Falha ao tentar criar novo cliente:", newCustomerData);
        }
      }
    } catch (custError) {
      console.warn("⚠️ Aviso ao buscar/criar cliente, prosseguindo como visitante/convidado.", custError);
    }

    const metodoEscolhido = paymentMethod || 'appmax_pix';
    const tituloMetodo = metodoEscolhido.includes('pix') ? 'Pix -- AppMax' : 'Cartão de Crédito -- AppMax';

    // 🛍️ 2. MONTAR O PAYLOAD DO PEDIDO NO WOOCOMMERCE
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

    console.log("🚀 Criando pedido no WooCommerce...", JSON.stringify(wcOrderPayload, null, 2));

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

    // 🔍 3. CAPTURA DA URL DE PAGAMENTO DA APPMAX
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

    // 🚀 O SEGREDO DO 404 ESTÁ AQUI: O domínio que responde pelo WordPress não é mais sambavest.com
    // Ele força a substituição do domínio principal (que agora é o Next.js) pelo domínio real onde o WooCommerce mora.
    if (!paymentUrl || paymentUrl.includes('order-pay')) {
      const wpBaseUrl = process.env.WP_BACKEND_URL || wcUrl;
      paymentUrl = `${wpBaseUrl}/finalizar-compra/order-pay/${wcData.id}/?pay_for_order=true&key=${wcData.order_key}`;
    }

    // 🔥 Limpeza extra para evitar que a Vercel quebre ao tentar redirecionar para sambavest.com
    if (paymentUrl.includes('https://sambavest.com/finalizar-compra')) {
        paymentUrl = paymentUrl.replace('https://sambavest.com', wcUrl);
    }

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