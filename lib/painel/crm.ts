// CRM do WhatsApp: um cadastro permanente por telefone, alimentado por toda conversa.
//
// A conversa (mensagens) fica em lib/automacao/conversas.ts. Aqui fica o que é do relacionamento:
// nome, etapa do funil, etiquetas, notas internas e as datas de contato. Cada mensagem que entra ou
// sai chama sincronizarCrm(), então nenhum contato se perde.
//
//   crm:contato:<chave>  → o contato (sem validade)
//   crm:contatos         → lista ordenada pela última atividade
import type { Conversa } from '../automacao/conversas';
import { kvGet, kvSet, kvZAdd, kvZRevRange } from '../automacao/kv';
import { chaveTelefone } from '../automacao/whatsapp';

export const ETAPAS = [
  { id: 'novo', nome: 'Novo contato' },
  { id: 'atendimento', nome: 'Em atendimento' },
  { id: 'pagamento', nome: 'Aguardando pagamento' },
  { id: 'cliente', nome: 'Comprou' },
  { id: 'pos-venda', nome: 'Pós-venda / troca' },
  { id: 'perdido', nome: 'Não fechou' },
] as const;
export type Etapa = (typeof ETAPAS)[number]['id'];
export const nomeEtapa = (e: string) => ETAPAS.find((x) => x.id === e)?.nome || e;

export type NotaCrm = { texto: string; em: number };

export type ContatoCrm = {
  chave: string; // DDD + 8 últimos dígitos (o mesmo número com ou sem o 9 extra)
  numero: string; // número para responder (formato da Meta)
  nome?: string; // nome do perfil do WhatsApp
  nomeEditado?: string; // nome definido pela loja (tem prioridade)
  etapa: Etapa;
  etiquetas: string[];
  notas: NotaCrm[];
  criadoEm: number;
  ultimaAtividade: number;
  ultimaDoCliente?: number;
  ultimaMensagem?: string;
  ultimaDe?: string;
  naoLidas: number;
  mensagensCliente: number; // quantas mensagens o cliente já mandou (0 = só recebeu avisos)
  pedidos?: number[];
};

const INDICE = 'crm:contatos';
const chaveKv = (chave: string) => `crm:contato:${chave}`;

export const nomeDoContato = (c: ContatoCrm) => c.nomeEditado || c.nome || `+${c.numero}`;

export function obterContato(chave: string): Promise<ContatoCrm | null> {
  return kvGet<ContatoCrm>(chaveKv(chave));
}

export async function salvarContato(c: ContatoCrm): Promise<void> {
  await kvSet(chaveKv(c.chave), c);
  await kvZAdd(INDICE, c.ultimaAtividade, c.chave);
}

/** Atualiza (ou cria) o contato a partir da conversa. Chamado a cada mensagem. */
export async function sincronizarCrm(conversa: Conversa): Promise<ContatoCrm | null> {
  const chave = chaveTelefone(conversa.numero) || conversa.numero;
  if (!chave) return null;
  const atual = await obterContato(chave);
  const ultima = conversa.mensagens[conversa.mensagens.length - 1];
  const doCliente = conversa.mensagens.filter((m) => m.de === 'cliente');
  const c: ContatoCrm = atual || {
    chave,
    numero: conversa.numero,
    etapa: 'novo',
    etiquetas: [],
    notas: [],
    criadoEm: conversa.mensagens[0]?.em || Date.now(),
    ultimaAtividade: Date.now(),
    naoLidas: 0,
    mensagensCliente: 0,
  };
  c.numero = conversa.numero || c.numero;
  if (conversa.nome) c.nome = conversa.nome;
  c.ultimaAtividade = Math.max(c.ultimaAtividade || 0, conversa.atualizadaEm || 0, ultima?.em || 0);
  c.ultimaDoCliente = conversa.ultimaDoClienteEm || c.ultimaDoCliente;
  if (ultima) {
    c.ultimaMensagem = ultima.texto.slice(0, 160);
    c.ultimaDe = ultima.de;
  }
  c.naoLidas = conversa.naoLidas;
  // O histórico da conversa guarda só as últimas mensagens: o contador nunca diminui
  c.mensagensCliente = Math.max(c.mensagensCliente || 0, doCliente.length);
  if (conversa.pedidos?.length) c.pedidos = [...new Set([...(c.pedidos || []), ...conversa.pedidos])].slice(-20);
  await salvarContato(c);
  return c;
}

/** Contatos do mais recente para o mais antigo. */
export async function listarContatos(limite = 500): Promise<ContatoCrm[]> {
  const chaves = await kvZRevRange(INDICE, 0, limite - 1);
  const lista = await Promise.all(chaves.map((k) => obterContato(k)));
  return lista.filter((c): c is ContatoCrm => Boolean(c));
}

/** Garante que conversas que existiam antes do CRM também tenham contato. */
export async function importarConversas(conversas: Conversa[]): Promise<number> {
  let novos = 0;
  for (const conv of conversas) {
    const chave = chaveTelefone(conv.numero) || conv.numero;
    if (!(await obterContato(chave))) {
      await sincronizarCrm(conv);
      novos++;
    }
  }
  return novos;
}
