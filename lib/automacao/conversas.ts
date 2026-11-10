// Histórico das conversas do WhatsApp, guardado no Upstash (lib/automacao/kv.ts).
//
//   wa:conversa:<numero>  → a conversa (últimas mensagens), expira 30 dias após a última atividade
//   wa:conversas          → lista ordenada pelo horário da última mensagem (para o painel)
import { chaveTelefone } from './whatsapp';
import { adquirirTrava, kvGet, kvSet, kvZAdd, kvZRemAbaixoDe, kvZRevRange, liberarTrava } from './kv';

export type Autor = 'cliente' | 'robo' | 'loja' | 'aviso';

export type Mensagem = {
  id?: string;
  de: Autor;
  texto: string;
  em: number; // timestamp em ms
  status?: string; // entregue / lida / falhou (mensagens enviadas)
};

export type Conversa = {
  numero: string; // número para responder (wa_id que a Meta informou), ex.: 5521996959903
  nome?: string;
  mensagens: Mensagem[];
  ultimaDoClienteEm?: number; // abre a janela de 24h
  atualizadaEm: number;
  /** Aguardando resposta de uma pessoa da loja (o robô não responde enquanto isso). */
  humanoAte?: number;
  naoLidas: number;
  pedidos?: number[]; // pedidos encontrados para este número
};

const MAX_MENSAGENS = 60;
const VALIDADE_S = 30 * 86_400;
const INDICE = 'wa:conversas';
// O mesmo celular pode aparecer com ou sem o 9 extra; a chave ignora essa diferença.
const idConversa = (numero: string) => chaveTelefone(numero) || numero;
const chave = (numero: string) => `wa:conversa:${idConversa(numero)}`;

export const JANELA_MS = 24 * 3_600_000;

export function janelaAberta(c: Conversa | null, agora = Date.now()): boolean {
  return Boolean(c?.ultimaDoClienteEm && agora - c.ultimaDoClienteEm < JANELA_MS - 60_000);
}

export function obterConversa(numero: string): Promise<Conversa | null> {
  return kvGet<Conversa>(chave(numero));
}

/** Lê, altera e grava a conversa com trava, para duas mensagens seguidas não se sobrescreverem. */
export async function alterarConversa(numero: string, fn: (c: Conversa) => void): Promise<Conversa> {
  let travou = false;
  for (let i = 0; i < 20 && !travou; i++) {
    travou = await adquirirTrava(`conversa:${idConversa(numero)}`, 10);
    if (!travou) await new Promise((r) => setTimeout(r, 150));
  }
  try {
    const c: Conversa = (await obterConversa(numero)) || { numero, mensagens: [], atualizadaEm: Date.now(), naoLidas: 0 };
    fn(c);
    if (c.mensagens.length > MAX_MENSAGENS) c.mensagens = c.mensagens.slice(-MAX_MENSAGENS);
    c.atualizadaEm = Date.now();
    await kvSet(chave(numero), c, VALIDADE_S);
    await kvZAdd(INDICE, c.atualizadaEm, idConversa(numero));
    return c;
  } finally {
    if (travou) await liberarTrava(`conversa:${idConversa(numero)}`);
  }
}

/** Registra uma mensagem enviada pela loja (robô, pessoa ou aviso automático). */
export function registrarSaida(numero: string, texto: string, de: Autor, id?: string): Promise<Conversa> {
  return alterarConversa(numero, (c) => {
    c.mensagens.push({ id, de, texto, em: Date.now() });
  });
}

/** Atualiza o status de entrega de uma mensagem enviada (webhook de status da Meta). */
export async function atualizarStatus(numero: string, id: string, status: string): Promise<void> {
  const atual = await obterConversa(numero);
  if (!atual?.mensagens.some((m) => m.id === id)) return;
  await alterarConversa(numero, (c) => {
    const m = c.mensagens.find((x) => x.id === id);
    if (m) m.status = status;
  });
}

export async function listarConversas(limite = 50): Promise<Conversa[]> {
  await kvZRemAbaixoDe(INDICE, Date.now() - VALIDADE_S * 1000);
  const ids = await kvZRevRange(INDICE, 0, limite - 1);
  const conversas = await Promise.all(ids.map((i) => kvGet<Conversa>(`wa:conversa:${i}`)));
  return conversas.filter((c): c is Conversa => Boolean(c));
}
