// Webhook da WhatsApp Cloud API (Meta): mensagens recebidas e status das mensagens enviadas.
//
// Configurar em: developers.facebook.com → seu app → WhatsApp → Configuração → Webhook
//   URL de retorno: https://SEU-SITE/api/webhooks/whatsapp
//   Token de verificação: o mesmo valor de WHATSAPP_VERIFY_TOKEN
//   Campos: assine "messages" e, com coexistência (número também no app WhatsApp Business),
//   "smb_message_echoes" (cópia das mensagens que você manda pelo app)
// A assinatura de cada POST é conferida com a Chave secreta do app (WHATSAPP_APP_SECRET).
import crypto from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { EcoMeta, processarMensagem, MensagemMeta, registrarEco } from '../../../../lib/automacao/atendimento';
import { config } from '../../../../lib/automacao/config';
import { atualizarStatus } from '../../../../lib/automacao/conversas';
import { alertarLoja } from '../../../../lib/automacao/notificacoes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type StatusMeta = {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  recipient_id: string;
  errors?: { code: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

type CorpoMeta = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: MensagemMeta[];
        message_echoes?: EcoMeta[]; // coexistência: mensagens enviadas pelo app WhatsApp Business
        statuses?: StatusMeta[];
      };
    }[];
  }[];
};

/** Verificação da URL (a Meta chama uma vez ao salvar o webhook). */
export function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const token = p.get('hub.verify_token') || '';
  const esperado = config.whatsapp.verifyToken || '';
  const ok =
    p.get('hub.mode') === 'subscribe' &&
    esperado !== '' &&
    token.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
  if (!ok) return new NextResponse('token inválido', { status: 403 });
  return new NextResponse(p.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

function assinaturaValida(corpo: string, assinatura: string | null): boolean {
  if (!config.whatsapp.appSecret || !assinatura?.startsWith('sha256=')) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret).update(corpo, 'utf8').digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(assinatura);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const STATUS_PT: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };

export async function POST(request: Request) {
  const corpo = await request.text();
  if (!assinaturaValida(corpo, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ ok: false, error: 'assinatura inválida' }, { status: 401 });
  }

  let dados: CorpoMeta;
  try {
    dados = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ ok: false, error: 'json inválido' }, { status: 400 });
  }

  const mensagens: { m: MensagemMeta; nome?: string }[] = [];
  const status: StatusMeta[] = [];
  const ecos: EcoMeta[] = [];
  for (const entrada of dados.entry || []) {
    for (const mudanca of entrada.changes || []) {
      if (!mudanca.value) continue;
      const v = mudanca.value;
      if (mudanca.field === 'smb_message_echoes') {
        ecos.push(...(v.message_echoes || []));
        continue;
      }
      // Outros campos (ex.: history, smb_app_state_sync) não são usados.
      if (mudanca.field !== 'messages') continue;
      for (const m of v.messages || []) {
        const nome = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
        mensagens.push({ m, nome });
      }
      status.push(...(v.statuses || []));
    }
  }

  // A Meta reenvia o webhook se a resposta demorar; processa depois de responder 200.
  after(async () => {
    // Ecos primeiro: se você já respondeu pelo app, o robô não responde por cima.
    for (const e of ecos) {
      try {
        const r = await registrarEco(e);
        console.log('[atendimento] eco do app', JSON.stringify(r));
      } catch (err) {
        console.error('[atendimento] erro ao registrar eco', e.id, (err as Error).message);
      }
    }
    for (const { m, nome } of mensagens) {
      try {
        const r = await processarMensagem(m, nome);
        console.log('[atendimento] mensagem', JSON.stringify(r));
      } catch (e) {
        console.error('[atendimento] erro ao processar mensagem', m.id, (e as Error).message);
      }
    }
    for (const s of status) {
      try {
        await atualizarStatus(s.recipient_id, s.id, STATUS_PT[s.status] || s.status);
        if (s.status === 'failed') {
          const erro = s.errors?.[0];
          const texto = `${erro?.title || erro?.message || 'erro'} (código ${erro?.code ?? '?'})${erro?.error_data?.details ? ' — ' + erro.error_data.details : ''}`;
          console.error('[atendimento] mensagem não entregue', s.recipient_id, texto);
          await alertarLoja(
            `WhatsApp não entregue para +${s.recipient_id}`,
            `<p>A mensagem para <b>+${s.recipient_id}</b> não foi entregue.</p><p>${texto.replace(/</g, '&lt;')}</p>`
          );
        }
      } catch (e) {
        console.error('[atendimento] erro ao atualizar status', s.id, (e as Error).message);
      }
    }
  });

  return NextResponse.json({ ok: true, mensagens: mensagens.length, ecos: ecos.length, status: status.length });
}
