import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Pega o código de autorização que o Bling envia na URL
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Código de autorização não encontrado na URL' }, { status: 400 });
  }

  // Prepara as credenciais em Base64 (exigência do Bling)
  const credentials = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');

  try {
    // Pede o Token Oficial pro Bling
    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'Accept': '1.0'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
      })
    });

    const data = await response.json();

    // Mostra o token na tela para você copiar!
    return NextResponse.json({
      mensagem: 'SUCESSO! Copie o access_token e o refresh_token abaixo:',
      tokens: data
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao se comunicar com o Bling' }, { status: 500 });
  }
}