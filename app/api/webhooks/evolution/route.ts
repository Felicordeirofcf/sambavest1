// Recebe as mensagens da Evolution API (WhatsApp pelo QR Code) e grava no histórico/CRM.
//
// Configurado sozinho pelo painel (/painel/whatsapp → "Configurar recebimento"):
//   URL: https://SEU-SITE/api/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>
//   Evento: MESSAGES_UPSERT
// Sem automação: nada é respondido daqui. Só registra mensagens do cliente e as suas (pelo celular).
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { config } from '../../../../lib/automacao/config';
import { alterarConversa } from '../../../../lib/automacao/conversas';
import { MensagemEvolution, telefoneDaMensagem, textoEvolution } from '../../../../lib/automacao/evolution';
import { adquirirTrava } from '../../../../lib/automacao/kv';

export const dynamic = 'force-dynamic';

function tokenValido(recebido: string | null): boolean {
  const esperado = config.evolution.webhookToken;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type CorpoEvolution = { event?: string; instance?: string; data?: MensagemEvolution | MensagemEvolution[] | { messages?: MensagemEvolution[] } };

export async function POST(request: Request) {
  if (!tokenValido(new URL(request.url).searchParams.get('token'))) {
    return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 });
  }
  let corpo: CorpoEvolution;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json inválido' }, { status: 400 });
  }

  const evento = String(corpo.event || '').toLowerCase().replace(/_/g, '.');
  if (evento !== 'messages.upsert') return NextResponse.json({ ok: true, ignorado: corpo.event || 'sem evento' });
  if (corpo.instance && corpo.instance !== config.evolution.instancia) {
    return NextResponse.json({ ok: true, ignorado: 'outra instância' });
  }

  const d = corpo.data;
  const lista: MensagemEvolution[] = Array.isArray(d) ? d : d && 'messages' in d && Array.isArray(d.messages) ? d.messages : d ? [d as MensagemEvolution] : [];

  let gravadas = 0;
  for (const m of lista) {
    const numero = telefoneDaMensagem(m);
    const texto = textoEvolution(m);
    const id = m.key?.id;
    if (!numero || !texto || !id) continue;
    // A Evolution pode reenviar o mesmo evento
    if (!(await adquirirTrava(`wa:msg:${id}`, 3 * 86_400))) continue;
    const em = Number(m.messageTimestamp) * 1000 || Date.now();

    if (m.key?.fromMe) {
      // Enviada pela loja: pelo celular (app) ou pelo próprio painel (já registrada com o mesmo ID)
      await alterarConversa(numero, (c) => {
        if (c.mensagens.some((x) => x.id === id)) return;
        c.numero = c.numero || numero;
        c.mensagens.push({ id, de: 'loja', texto: `${texto} (pelo celular)`, em });
        c.naoLidas = 0;
      });
    } else {
      await alterarConversa(numero, (c) => {
        c.numero = numero;
        if (m.pushName) c.nome = m.pushName;
        c.mensagens.push({ id, de: 'cliente', texto, em });
        c.ultimaDoClienteEm = Date.now();
        c.naoLidas = (c.naoLidas || 0) + 1;
      });
    }
    gravadas++;
  }
  return NextResponse.json({ ok: true, gravadas });
}
