import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const cpf = searchParams.get('cpf');

    if (!email || !cpf) {
      return NextResponse.json(
        { success: false, error: 'E-mail e CPF são obrigatórios.' },
        { status: 400 }
      );
    }

    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      console.error('❌ Erro: Credenciais do WooCommerce ausentes nas variáveis de ambiente da Vercel.');
      return NextResponse.json(
        { success: false, error: 'Credenciais do servidor ausentes.' },
        { status: 500 }
      );
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // 🔍 1. Busca os pedidos no WooCommerce filtrando diretamente pelo parâmetro email da API v3
    const targetUrl = `${wcUrl}/wp-json/wc/v3/orders?email=${encodeURIComponent(email)}&per_page=50`;
    console.log(`🔍 Consultando WooCommerce: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      headers: { 'Authorization': authHeader },
      cache: 'no-store',
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`❌ Erro do WooCommerce (${response.status}):`, responseText);
      return NextResponse.json(
        { success: false, error: 'Erro ao comunicar com o WooCommerce.' },
        { status: 500 }
      );
    }

    let orders;
    try {
      orders = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Erro ao converter resposta do WooCommerce para JSON:', responseText);
      throw new Error('Resposta inválida do servidor de pagamentos.');
    }

    if (!Array.isArray(orders)) {
      console.warn('⚠️ WooCommerce retornou um formato inesperado:', orders);
      orders = [];
    }

    // 🔒 2. Filtro de Segurança: Garante que o CPF do pedido é igual ao CPF digitado
    const cpfLimpo = cpf.replace(/\D/g, '');
    const userOrders = orders.filter((order: any) => {
      const orderCpfMeta = order.meta_data?.find((m: any) => m.key === '_billing_cpf' || m.key === 'cpf');
      const orderCpf = orderCpfMeta?.value?.replace(/\D/g, '');
      const orderEmail = order.billing?.email || '';
      return orderEmail.toLowerCase() === email.toLowerCase() && orderCpf === cpfLimpo;
    });

    // 📦 3. Formata os dados para o Front-end
    const formattedOrders = userOrders.map((order: any) => {
      return {
        id: order.id,
        status: order.status,
        date: order.date_created ? new Date(order.date_created).toLocaleDateString('pt-BR') : '',
        total: order.total,
        payment_method_title: order.payment_method_title,
        items: (order.line_items || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        shipping: order.shipping,
      };
    });

    return NextResponse.json({ success: true, orders: formattedOrders });

  } catch (error: any) {
    console.error('❌ Erro crítico na API de Pedidos:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno ao buscar pedidos.' },
      { status: 500 }
    );
  }
}