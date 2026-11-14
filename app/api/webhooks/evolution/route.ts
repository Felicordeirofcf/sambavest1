// Recebe as mensagens da Evolution API (WhatsApp pelo QR Code) e grava no histórico/CRM.
//
// Configurado sozinho pelo painel (/painel/whatsapp → "Configurar recebimento"):
//   URL: https://SEU-SITE/api/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>
//   Evento: MESSAGES_UPSERT
// Mensagem do cliente: segue o mesmo caminho da API oficial (processarMensagem): grava no CRM,
// avisa o dono e, com WHATSAPP_IA=true, a IA responde (envio pela própria Evolution).
// Mensagem sua pelo celular: grava e silencia a IA nessa conversa (uma pessoa assumiu).
import crypto from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { ehSaidaDoRobo, processarMensagem } from '../../../../lib/automacao/atendimento';
import { config } from '../../../../lib/automacao/config';
import { alterarConversa } from '../../../../lib/automacao/conversas';
import { MensagemEvolution, motivoSemTelefone, registrarDiag, telefoneDaMensagem, textoEvolution } from '../../../../lib/automacao/evolution';
import { adquirirTrava } from '../../../../lib/automacao/kv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    // Registra no máximo 1 por minuto (qualquer um pode bater nesta URL)
    if (await adquirirTrava('evo:diag:401', 60)) await registrarDiag('recusada: senha (token) do webhook não confere com EVOLUTION_WEBHOOK_TOKEN');
    return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 });
  }
  let corpo: CorpoEvolution;
  try {
    corpo = await request.json();
  } catch {
    await registrarDiag('recusada: corpo não é JSON');
    return NextResponse.json({ ok: false, error: 'json inválido' }, { status: 400 });
  }

  const evento = String(corpo.event || '').toLowerCase().replace(/_/g, '.');
  if (evento !== 'messages.upsert') {
    await registrarDiag(`ignorada: evento ${corpo.event || 'sem nome'}`);
    return NextResponse.json({ ok: true, ignorado: corpo.event || 'sem evento' });
  }
  if (corpo.instance && corpo.instance !== config.evolution.instancia) {
    await registrarDiag(`ignorada: veio da instância "${String(corpo.instance).slice(0, 40)}", o site usa "${config.evolution.instancia}"`);
    return NextResponse.json({ ok: true, ignorado: 'outra instância' });
  }

  const d = corpo.data;
  const lista: MensagemEvolution[] = Array.isArray(d) ? d : d && 'messages' in d && Array.isArray(d.messages) ? d.messages : d ? [d as MensagemEvolution] : [];

  if (!lista.length) await registrarDiag('ignorada: evento sem mensagens no formato esperado');
  const doCliente: { m: MensagemEvolution; numero: string; texto: string; id: string }[] = [];
  let gravadas = 0;
  for (const m of lista) {
    const numero = telefoneDaMensagem(m);
    const texto = textoEvolution(m);
    const id = m.key?.id;
    if (!numero || !texto || !id) {
      await registrarDiag(`ignorada: ${!numero ? motivoSemTelefone(m) : !texto ? 'sem texto (reação/sistema)' : 'sem ID'}`);
      continue;
    }
    await registrarDiag(m.key?.fromMe ? 'recebida: enviada pela loja' : 'recebida: mensagem de cliente');

    if (!m.key?.fromMe) {
      // A trava contra repetição fica dentro de processarMensagem
      doCliente.push({ m, numero, texto, id });
      continue;
    }

    // A Evolution pode reenviar o mesmo evento
    if (!(await adquirirTrava(`wa:msg:${id}`, 3 * 86_400))) continue;
    // Resposta que o robô/IA acabou de mandar: ele mesmo registra na conversa
    if (await ehSaidaDoRobo(numero, texto)) continue;
    const em = Number(m.messageTimestamp) * 1000 || Date.now();
    // Enviada pela loja: pelo celular (app) ou pelo próprio painel (já registrada com o mesmo ID)
    await alterarConversa(numero, (c) => {
      if (c.mensagens.some((x) => x.id === id)) return;
      c.numero = c.numero || numero;
      c.mensagens.push({ id, de: 'loja', texto: `${texto} (pelo celular)`, em });
      c.naoLidas = 0;
      // Uma pessoa respondeu pelo celular: a IA fica quieta nesta conversa por um tempo
      c.humanoAte = Date.now() + config.whatsapp.respostas.silencioHoras * 3_600_000;
    });
    gravadas++;
  }

  // A IA pode levar alguns segundos: responde 200 já e processa depois (a Evolution não reenvia à toa).
  if (doCliente.length) {
    after(async () => {
      for (const { m, numero, texto, id } of doCliente) {
        try {
          const msg = (m.message || {}) as Record<string, unknown>;
          const ehTexto = typeof msg.conversation === 'string' || Boolean(msg.extendedTextMessage);
          const r = await processarMensagem(
            { id, from: numero, timestamp: String(m.messageTimestamp || ''), type: ehTexto ? 'text' : m.messageType || 'midia' },
            m.pushName,
            { texto, ehTexto }
          );
          console.log('[evolution] mensagem', JSON.stringify(r));
        } catch (e) {
          console.error('[evolution] erro ao processar mensagem', id, (e as Error).message);
        }
      }
    });
  }
  return NextResponse.json({ ok: true, gravadas, clientes: doCliente.length });
}
