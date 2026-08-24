// app/api/bling/callback/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Código de autorização (code) não encontrado na URL.' },
        { status: 400 }
      );
    }

    const clientId = process.env.BLING_CLIENT_ID;
    const clientSecret = process.env.BLING_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'BLING_CLIENT_ID ou BLING_CLIENT_SECRET não configurados nas variáveis de ambiente.' },
        { status: 500 }
      );
    }

    // Cria a credencial em Base64 exigida pela API v3 do Bling
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Troca o "code" temporário pelos tokens definitivos
    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Erro ao trocar o code pelos tokens no Bling:', data);
      return NextResponse.json(
        { error: 'Erro ao autenticar com o Bling.', detalhes: data },
        { status: 400 }
      );
    }

    // Sucesso! Retorna os tokens bonitinhos na tela para você copiar
    return NextResponse.json({
      success: true,
      message: 'Tokens gerados com sucesso! Copie os valores abaixo e cole nas variáveis do Vercel:',
      BLING_ACCESS_TOKEN: data.access_token,
      BLING_REFRESH_TOKEN: data.refresh_token,
    }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Erro interno no callback do Bling:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno no callback.' },
      { status: 500 }
    );
  }
}