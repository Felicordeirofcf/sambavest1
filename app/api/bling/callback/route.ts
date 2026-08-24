// app/api/bling/callback/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Código de autorização não encontrado na URL.' }, { status: 400 });
    }

    // Aqui o Bling mandou o 'code' com sucesso!
    return NextResponse.json({
      success: true,
      message: 'Autorização do Bling recebida com sucesso!',
      code: code
    });

  } catch (error: any) {
    console.error('Erro no callback do Bling:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no callback.' }, { status: 500 });
  }
}