// app/api/bling/callback/route.ts
// Endereço de retorno (redirect) do aplicativo no Bling.
// Só aceita autorizações iniciadas pelo botão "Conectar Bling" do painel (/painel/integracoes),
// que gera um "state" de uso único. Troca o código pelos tokens e salva no KV.
import { NextResponse } from 'next/server';
import { autorizarComCodigo, stateValido } from '../../../../lib/automacao/bling';
import { integracoes } from '../../../../lib/automacao/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Código de autorização (code) não encontrado na URL.' }, { status: 400 });
  }
  if (!(await stateValido(params.get('state')))) {
    return NextResponse.json(
      {
        error:
          'Autorização não reconhecida ou expirada. Conecte o Bling pelo painel: sambavest.com/painel/integracoes → "Conectar Bling".',
      },
      { status: 400 }
    );
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
    return NextResponse.json({ error: 'Não foi possível concluir a autorização no Bling. Tente de novo pelo painel.' }, { status: 400 });
  }
}
