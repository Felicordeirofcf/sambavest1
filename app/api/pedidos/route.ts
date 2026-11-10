import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '../../../lib/automacao/kv';

// Limite de consultas por IP, para ninguém testar e-mails/CPFs em sequência.
const LIMITE_CONSULTAS = 10;
const JANELA_SEGUNDOS = 15 * 60;

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

    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido';
    const chaveLimite = `limite:pedidos:${ip}`;
    try {
      const tentativas = (await kvGet<number>(chaveLimite)) || 0;
      if (tentativas >= LIMITE_CONSULTAS) {
        return NextResponse.json(
          { success: false, error: 'Muitas consultas seguidas. Aguarde 15 minutos e tente de novo.' },
          { status: 429 }
        );
      }
      await kvSet(chaveLimite, tentativas + 1, JANELA_SEGUNDOS);
    } catch (e) {
      console.error('Limite de consultas indisponível:', e);
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

    // 🔍 1. Busca os pedidos no WooCommerce pelo e-mail
    // A API v3 não tem filtro "email": "search" procura no e-mail de cobrança (e em outros campos);
    // o filtro exato de e-mail + CPF é feito logo abaixo.
    const targetUrl = `${wcUrl}/wp-json/wc/v3/orders?search=${encodeURIComponent(email.trim())}&per_page=50`;

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
      const orderCpf = String(orderCpfMeta?.value ?? '').replace(/\D/g, '');
      const orderEmail = order.billing?.email || '';
      return orderEmail.trim().toLowerCase() === email.trim().toLowerCase() && !!cpfLimpo && orderCpf === cpfLimpo;
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
      { success: false, error: 'Erro interno ao buscar pedidos.' },
      { status: 500 }
    );
  }
}