// app/api/checkout/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📦 Body bruto recebido na API de Checkout:", JSON.stringify(body, null, 2));

    const { cliente, items } = body;
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

    // 🌐 Credenciais e URL do WooCommerce configuradas no .env.local
    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      return NextResponse.json(
        { success: false, error: 'Credenciais do WooCommerce (Consumer Key/Secret) não configuradas no servidor.' },
        { status: 500 }
      );
    }

    const partesNome = clienteFinal.nome.trim().split(' ');
    const firstName = partesNome[0] || 'Cliente';
    const lastName = partesNome.slice(1).join(' ') || 'Da Loja';

    const documentoLimpo = clienteFinal.numeroDocumento.replace(/\D/g, '');

    const wcOrderPayload = {
      payment_method: 'appmax', // Identificador padrão da Appmax no WooCommerce
      payment_method_title: 'Appmax Pagamentos',
      set_paid: false,
      billing: {
        first_name: firstName,
        last_name: lastName,
        address_1: `${clienteFinal.endereco}, ${clienteFinal.numero} - ${clienteFinal.bairro}`,
        city: clienteFinal.cidade,
        state: clienteFinal.uf,
        postcode: clienteFinal.cep.replace(/\D/g, ''),
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
        postcode: clienteFinal.cep.replace(/\D/g, ''),
        country: 'BR',
      },
      line_items: listaItens.map((item: any) => {
        // Se o item tiver parent_id, significa que 'id' é a variação (ex: Regata/G) e 'parent_id' é o produto pai.
        // Se não tiver parent_id, tratamos o 'id' como o ID do produto diretamente.
        const isVariation = Boolean(item.parent_id);

        return {
          product_id: isVariation ? Number(item.parent_id) : Number(item.id),
          variation_id: isVariation ? Number(item.id) : 0, // Se for variação, passa o ID específico aqui!
          quantity: Number(item.quantity || item.quantidade || 1),
          price: String(item.price || item.valorUnitario || 0),
        };
      }),
      // Metadados necessários para a Appmax e gateway processarem CPF/CNPJ corretamente
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

    console.log("🚀 Criando pedido no WooCommerce/Appmax...", wcOrderPayload);

    // 🔐 Autenticação Basic Auth para a API REST do WooCommerce
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

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

    // O WooCommerce retorna a URL de pagamento gerada pelo gateway (Appmax)
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