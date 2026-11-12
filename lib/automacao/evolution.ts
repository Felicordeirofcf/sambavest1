// Evolution API: WhatsApp conectado pelo QR Code (protocolo do WhatsApp Web).
//
// ⚠️ Não é a API oficial da Meta: o número pode ser bloqueado pelo WhatsApp se for usado para
// mandar mensagens em massa. Aqui ela serve só para o atendimento 1 a 1 pelo painel:
// - mensagens recebidas e as que você manda pelo celular entram no CRM (/api/webhooks/evolution);
// - você responde pelo painel (sem a janela de 24h da API oficial).
// Nada é enviado automaticamente.
import { config } from './config';

type Init = { method?: string; body?: unknown };

export async function evo<T = unknown>(caminho: string, init: Init = {}): Promise<T> {
  const { url, apiKey } = config.evolution;
  if (!url || !apiKey) throw new Error('Evolution não configurada (EVOLUTION_URL / EVOLUTION_API_KEY).');
  const res = await fetch(`${url}${caminho}`, {
    method: init.method || 'GET',
    headers: { apikey: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const texto = await res.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta não-JSON
  }
  if (!res.ok) {
    const j = json as { response?: { message?: unknown }; message?: unknown; error?: unknown } | null;
    const msg = j?.response?.message ?? j?.message ?? j?.error ?? texto.slice(0, 200);
    throw new Error(`Evolution ${res.status} em ${caminho}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json as T;
}

const inst = () => encodeURIComponent(config.evolution.instancia);

export type EstadoEvolution = 'open' | 'connecting' | 'close' | 'inexistente' | 'erro';

/** Situação da conexão: open = conectado; close/connecting = precisa ler o QR Code. */
export async function estadoConexao(): Promise<{ estado: EstadoEvolution; detalhe?: string }> {
  try {
    const r = await evo<{ instance?: { state?: string }; state?: string }>(`/instance/connectionState/${inst()}`);
    const estado = (r.instance?.state || r.state || 'close') as EstadoEvolution;
    return { estado };
  } catch (e) {
    const msg = (e as Error).message;
    if (/ 404 /.test(msg) || /does not exist|not found|não existe/i.test(msg)) return { estado: 'inexistente' };
    return { estado: 'erro', detalhe: msg };
  }
}

/** Cria a instância (se ainda não existir). */
export async function criarInstancia(): Promise<void> {
  await evo('/instance/create', {
    method: 'POST',
    body: { instanceName: config.evolution.instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true },
  });
}

/** QR Code para conectar o número (imagem em base64, data URL). */
export async function qrCode(): Promise<{ imagem?: string; codigoPareamento?: string }> {
  const r = await evo<{ base64?: string; pairingCode?: string; qrcode?: { base64?: string } }>(`/instance/connect/${inst()}`);
  const b64 = r.base64 || r.qrcode?.base64;
  const imagem = b64 && !b64.startsWith('data:') ? `data:image/png;base64,${b64}` : b64;
  return { imagem, codigoPareamento: r.pairingCode || undefined };
}

/** Aponta o webhook da instância para o site, só com o evento de mensagens. */
export async function configurarWebhook(): Promise<string> {
  const url = `${config.siteUrl.replace(/\/$/, '')}/api/webhooks/evolution?token=${encodeURIComponent(config.evolution.webhookToken || '')}`;
  const webhook = { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] };
  try {
    // Evolution v2.1+
    await evo(`/webhook/set/${inst()}`, { method: 'POST', body: { webhook } });
  } catch {
    // Evolution v2.0 (formato antigo)
    await evo(`/webhook/set/${inst()}`, {
      method: 'POST',
      body: { enabled: true, url, webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT'] },
    });
  }
  return url.replace(/token=[^&]+/, 'token=…');
}

/** Desconecta o número (o celular continua com o WhatsApp normal). */
export async function desconectar(): Promise<void> {
  await evo(`/instance/logout/${inst()}`, { method: 'DELETE' });
}

/** Envia texto. Devolve o ID da mensagem no WhatsApp. */
export async function enviarTextoEvolution(numero: string, texto: string): Promise<string | undefined> {
  const n = numero.replace(/\D/g, '');
  let r: { key?: { id?: string } };
  try {
    r = await evo(`/message/sendText/${inst()}`, { method: 'POST', body: { number: n, text: texto } });
  } catch (e) {
    // Evolution v1 usava { textMessage: { text } }
    if (!/ 400 /.test((e as Error).message)) throw e;
    r = await evo(`/message/sendText/${inst()}`, { method: 'POST', body: { number: n, textMessage: { text: texto } } });
  }
  return r?.key?.id;
}

// ---------- Mensagens recebidas pelo webhook ----------

export type MensagemEvolution = {
  key?: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string; participant?: string };
  pushName?: string;
  message?: Record<string, unknown> | null;
  messageType?: string;
  messageTimestamp?: number | string;
};

/** Telefone (só dígitos) da conversa; null para grupos, status, canais etc. */
export function telefoneDaMensagem(m: MensagemEvolution): string | null {
  const jid = m.key?.remoteJid || '';
  if (!jid || jid.endsWith('@g.us') || jid.startsWith('status@') || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) return null;
  // Contatos com "LID" (identificador sem telefone): a Evolution manda o número em senderPn/remoteJidAlt
  const comTelefone = jid.endsWith('@lid') ? m.key?.senderPn || m.key?.remoteJidAlt || '' : jid;
  const d = comTelefone.split('@')[0].split(':')[0].replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

const TIPOS_MIDIA: Record<string, string> = {
  imageMessage: '📷 Foto',
  videoMessage: '🎬 Vídeo',
  audioMessage: '🎤 Áudio',
  pttMessage: '🎤 Áudio',
  documentMessage: '📄 Documento',
  stickerMessage: 'Figurinha',
  locationMessage: '📍 Localização',
  contactMessage: '👤 Contato',
};

/** Texto legível da mensagem (legenda de mídia quando houver). */
export function textoEvolution(m: MensagemEvolution): string | null {
  const msg = (m.message || {}) as Record<string, { text?: string; caption?: string; fileName?: string } | string | undefined>;
  if (typeof msg.conversation === 'string' && msg.conversation) return msg.conversation;
  const ext = msg.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  if (msg.reactionMessage || msg.protocolMessage || msg.senderKeyDistributionMessage) return null; // reações, apagadas, sistema
  for (const [tipo, rotulo] of Object.entries(TIPOS_MIDIA)) {
    const x = msg[tipo] as { caption?: string; fileName?: string } | undefined;
    if (x) return x.caption ? `${rotulo}: ${x.caption}` : x.fileName ? `${rotulo}: ${x.fileName}` : rotulo;
  }
  const tipo = m.messageType || Object.keys(msg)[0];
  return tipo ? `[${tipo}]` : null;
}
