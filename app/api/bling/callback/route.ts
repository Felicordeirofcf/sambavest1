// app/api/bling/callback/route.ts
// Endereço de retorno (redirect) do aplicativo no Bling.
// Troca o código de autorização pelos tokens e salva no KV — a partir daí os tokens
// são renovados sozinhos, sem precisar copiar nada para a Vercel.
import { NextResponse } from 'next/server';
import { autorizarComCodigo } from '../../../../lib/automacao/bling';
import { integracoes } from '../../../../lib/automacao/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Código de autorização (code) não encontrado na URL.' }, { status: 400 });
  }

  try {
    await autorizarComCodigo(code);
    return NextResponse.json({
      success: true,
      message: integracoes.kv()
        ? 'Bling conectado! Os tokens foram salvos e serão renovados automaticamente.'
        : 'Tokens gerados, mas o KV (Upstash) não está configurado: eles não ficarão salvos. Configure KV_REST_API_URL e KV_REST_API_TOKEN e autorize de novo.',
    });
  } catch (error) {
    console.error('❌ Erro no callback do Bling:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
