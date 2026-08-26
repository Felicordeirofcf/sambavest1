import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { cep, items } = await request.json();

    if (!cep || !items || items.length === 0) {
      return NextResponse.json({ error: 'CEP ou carrinho vazio' }, { status: 400 });
    }

    const token = process.env.MELHOR_ENVIO_TOKEN;
    const cepOrigem = process.env.CEP_ORIGEM;

    if (!token || !cepOrigem) {
      console.error('Faltam credenciais do Melhor Envio no .env');
      return NextResponse.json({ error: 'Erro de configuração do servidor' }, { status: 500 });
    }

    // Calcula o peso e valor total baseado no carrinho
    const totalItens = items.reduce((acc: number, item: any) => acc + item.quantity, 0);
    const valorTotal = items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);

    // O Melhor Envio exige payload de pacotes. 
    // Assumimos 1 pacote padronizado: 300g por camisa, caixa 20x15x10cm
    const payload = {
      from: { postal_code: cepOrigem },
      to: { postal_code: cep.replace(/\D/g, '') },
      products: [
        {
          id: "camisas",
          weight: totalItens * 0.3, // 300g por camisa
          width: 20,
          height: 10,
          length: 15,
          insurance_value: valorTotal,
          quantity: 1
        }
      ]
    };

    const response = await fetch('https://www.melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Samba Vest (seu-email@gmail.com)' // Coloque seu e-mail real aqui
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro Melhor Envio:', data);
      throw new Error('Falha ao calcular frete no Melhor Envio');
    }

    // Filtra apenas as opções que não deram erro e formata para o front-end
    const opcoesFrete = data
      .filter((cotacao: any) => !cotacao.error)
      .map((cotacao: any) => ({
        id: cotacao.id,
        name: `${cotacao.company.name} - ${cotacao.name}`, // Ex: "Correios - PAC"
        price: Number(cotacao.price),
        delivery_time: cotacao.delivery_time,
        company_picture: cotacao.company.picture
      }))
      .sort((a: any, b: any) => a.price - b.price); // Ordena do mais barato para o mais caro

    return NextResponse.json({ success: true, quotes: opcoesFrete });

  } catch (error: any) {
    console.error('Erro no cálculo de frete:', error);
    return NextResponse.json({ success: false, error: 'Erro ao calcular frete' }, { status: 500 });
  }
}