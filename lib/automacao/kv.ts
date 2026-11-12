// Armazenamento chave-valor para dados que precisam sobreviver entre execuções
// (token do Bling, travas contra processamento duplicado).
// Usa Upstash Redis via REST quando configurado; senão cai para memória local,
// que só serve para testes (na Vercel cada execução pode ter memória separada).
import { config, integracoes } from './config';

// Fica em globalThis para que rotas e páginas (empacotadas separadamente pelo Next) vejam o mesmo dado.
const g = globalThis as unknown as { __svKvMem?: Map<string, { valor: string; expiraEm: number | null }>; __svKvZ?: Map<string, Map<string, number>> };
const memoria = (g.__svKvMem ??= new Map());

async function redis(comando: (string | number)[]): Promise<unknown> {
  const res = await fetch(config.kv.url!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.kv.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando),
    cache: 'no-store',
  });
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || json.error) throw new Error(`KV: ${json.error || res.status}`);
  return json.result;
}

export async function kvGet<T>(chave: string): Promise<T | null> {
  if (integracoes.kv()) {
    const r = await redis(['GET', chave]);
    return typeof r === 'string' ? (JSON.parse(r) as T) : null;
  }
  const item = memoria.get(chave);
  if (!item) return null;
  if (item.expiraEm && item.expiraEm < Date.now()) {
    memoria.delete(chave);
    return null;
  }
  return JSON.parse(item.valor) as T;
}

export async function kvSet(chave: string, valor: unknown, segundos?: number): Promise<void> {
  const texto = JSON.stringify(valor);
  if (integracoes.kv()) {
    await redis(segundos ? ['SET', chave, texto, 'EX', segundos] : ['SET', chave, texto]);
    return;
  }
  memoria.set(chave, { valor: texto, expiraEm: segundos ? Date.now() + segundos * 1000 : null });
}

export async function kvDel(chave: string): Promise<void> {
  if (integracoes.kv()) {
    await redis(['DEL', chave]);
    return;
  }
  memoria.delete(chave);
}

/** Tenta pegar uma trava. Retorna false se outra execução já está com ela. */
export async function adquirirTrava(chave: string, segundos: number): Promise<boolean> {
  if (integracoes.kv()) {
    const r = await redis(['SET', `trava:${chave}`, '1', 'NX', 'EX', segundos]);
    return r === 'OK';
  }
  const k = `trava:${chave}`;
  const atual = memoria.get(k);
  if (atual && (!atual.expiraEm || atual.expiraEm > Date.now())) return false;
  memoria.set(k, { valor: '1', expiraEm: Date.now() + segundos * 1000 });
  return true;
}

export async function liberarTrava(chave: string): Promise<void> {
  await kvDel(`trava:${chave}`);
}

// ---------- Conjunto ordenado (lista de conversas recentes) ----------

const zsets = (g.__svKvZ ??= new Map());

export async function kvZAdd(chave: string, pontos: number, membro: string): Promise<void> {
  if (integracoes.kv()) {
    await redis(['ZADD', chave, pontos, membro]);
    return;
  }
  if (!zsets.has(chave)) zsets.set(chave, new Map());
  zsets.get(chave)!.set(membro, pontos);
}

/** Membros do maior para o menor score. */
export async function kvZRevRange(chave: string, inicio: number, fim: number): Promise<string[]> {
  if (integracoes.kv()) {
    const r = await redis(['ZREVRANGE', chave, inicio, fim]);
    return Array.isArray(r) ? (r as string[]) : [];
  }
  const z = zsets.get(chave);
  if (!z) return [];
  return [...z.entries()].sort((a, b) => b[1] - a[1]).slice(inicio, fim + 1).map(([m]) => m);
}

/** Remove membros com score menor que o limite. */
export async function kvZRemAbaixoDe(chave: string, limite: number): Promise<void> {
  if (integracoes.kv()) {
    await redis(['ZREMRANGEBYSCORE', chave, '-inf', `(${limite}`]);
    return;
  }
  const z = zsets.get(chave);
  if (z) for (const [m, p] of z) if (p < limite) z.delete(m);
}

// ---------- Limite de requisições ----------

/**
 * Conta mais uma requisição na janela e diz se ainda está dentro do limite.
 * Atômico no Upstash (INCR + EXPIRE). Se o KV falhar, deixa passar (melhor vender que travar a loja).
 */
export async function dentroDoLimite(chave: string, maximo: number, janelaS: number): Promise<boolean> {
  const k = `limite:${chave}`;
  try {
    if (integracoes.kv()) {
      const n = Number(await redis(['INCR', k]));
      if (n === 1) await redis(['EXPIRE', k, janelaS]);
      return n <= maximo;
    }
    const atual = memoria.get(k);
    const valido = atual && (!atual.expiraEm || atual.expiraEm > Date.now());
    const n = (valido ? Number(atual!.valor) : 0) + 1;
    memoria.set(k, { valor: String(n), expiraEm: valido ? atual!.expiraEm : Date.now() + janelaS * 1000 });
    return n <= maximo;
  } catch {
    return true;
  }
}

/** IP do cliente atrás da Vercel. */
export function ipDe(request: Request): string {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'desconhecido';
}
