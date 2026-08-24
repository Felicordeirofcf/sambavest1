// app/api/bling/callback/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Código de autorização não encontrado na URL.' }, { status: 400 });
    }

    // Aqui você pode processar o code recebido do Bling para gerar/salvar os tokens se precisar,
    // ou apenas retornar uma mensagem de sucesso informando que a autorização foi concluída.
    
    return NextResponse.json({
      success: true,
      message: 'Autorização do Bling recebida com sucesso! Pode fechar esta aba.',
      code: code
    });

  } catch (error: any) {
    console.error('Erro no callback do Bling:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no callback.' }, { status: 500 });
  }
}