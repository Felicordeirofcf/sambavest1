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

    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      return NextResponse.json(
        { success: false, error: 'Credenciais do servidor ausentes.' },
        { status: 500 }
      );
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // 🔍 1. Busca os pedidos no WooCommerce filtrando pelo e-mail
    const response = await fetch(`${wcUrl}/wp-json/wc/v3/orders?search=${encodeURIComponent(email)}`, {
      headers: { 'Authorization': authHeader },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Erro ao comunicar com o WooCommerce.');
    }

    const orders = await response.json();

    // 🔒 2. Filtro de Segurança: Garante que o CPF do pedido é igual ao CPF digitado
    const cpfLimpo = cpf.replace(/\D/g, '');
    const userOrders = orders.filter((order: any) => {
      const orderCpfMeta = order.meta_data.find((m: any) => m.key === '_billing_cpf' || m.key === 'cpf');
      const orderCpf = orderCpfMeta?.value?.replace(/\D/g, '');
      return order.billing.email.toLowerCase() === email.toLowerCase() && orderCpf === cpfLimpo;
    });

    // 📦 3. Formata os dados para o Front-end (escondendo dados sensíveis do WooCommerce)
    const formattedOrders = userOrders.map((order: any) => {
      return {
        id: order.id,
        status: order.status,
        date: new Date(order.date_created).toLocaleDateString('pt-BR'),
        total: order.total,
        payment_method_title: order.payment_method_title,
        items: order.line_items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        shipping: order.shipping,
      };
    });

    return NextResponse.json({ success: true, orders: formattedOrders });

  } catch (error: any) {
    console.error('❌ Erro na API de Pedidos:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao buscar pedidos.' },
      { status: 500 }
    );
  }
}