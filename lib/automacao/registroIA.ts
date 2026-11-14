// Registro das tentativas da IA do WhatsApp (Upstash), para o painel e a auditoria verem se ela
// está respondendo, passando para uma pessoa ou dando erro. Não guarda telefone nem texto do cliente.
import { kvGet, kvSet } from './kv';

const CHAVE = 'ia:registro';

export type RegistroIA = {
  em: number;
  resultado: 'respondeu' | 'transferiu' | 'erro' | 'pediu-texto';
  /** Erro da API ou motivo curto (sem dados do cliente). */
  detalhe?: string;
  tokens?: number;
  ferramentas?: string[];
};

export async function registrarIA(r: Omit<RegistroIA, 'em'>): Promise<void> {
  try {
    const lista = (await kvGet<RegistroIA[]>(CHAVE)) || [];
    lista.unshift({ ...r, em: Date.now(), detalhe: r.detalhe?.slice(0, 200) });
    await kvSet(CHAVE, lista.slice(0, 50), 14 * 86_400);
  } catch {
    // o registro nunca derruba o atendimento
  }
}

export async function lerRegistroIA(): Promise<RegistroIA[]> {
  return (await kvGet<RegistroIA[]>(CHAVE).catch(() => null)) || [];
}
