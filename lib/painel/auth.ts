// Login do painel de gestão (/painel). Senha única em PAINEL_SENHA
// (se não existir, usa a mesma ATENDIMENTO_SENHA do painel de WhatsApp).
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { config } from '../automacao/config';
import { kvGet, kvSet } from '../automacao/kv';
import { entrar as entrarAtendimento, sair as sairAtendimento } from '../automacao/painel';

const COOKIE = 'sv_painel';
const TENTATIVAS = 8;
const JANELA_S = 15 * 60;

export function senhaPainel(): string | undefined {
  const v = (process.env.PAINEL_SENHA || process.env.ATENDIMENTO_SENHA || '').trim();
  return v || undefined;
}

function assinatura(): string | null {
  const senha = senhaPainel();
  if (!senha) return null;
  return crypto.createHmac('sha256', senha).update('painel-gestao-v1').digest('hex');
}

export async function logado(): Promise<boolean> {
  const esperado = assinatura();
  const atual = (await cookies()).get(COOKIE)?.value;
  if (!esperado || !atual || atual.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(atual), Buffer.from(esperado));
}

/** Usar no começo de toda página e ação do painel. */
export async function exigirLogin(): Promise<void> {
  if (!(await logado())) redirect('/painel/entrar');
}

async function chaveLimite(): Promise<string> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido';
  return `limite:painel-login:${ip}`;
}

/** Confere a senha com limite de tentativas por IP. Retorna 'ok', 'senha' ou 'bloqueado'. */
export async function tentarEntrar(tentativa: string): Promise<'ok' | 'senha' | 'bloqueado'> {
  const senha = senhaPainel();
  const chave = await chaveLimite();
  let usadas = 0;
  try {
    usadas = (await kvGet<number>(chave)) || 0;
  } catch {
    // sem Upstash: segue sem limite
  }
  if (usadas >= TENTATIVAS) return 'bloqueado';

  const a = crypto.createHash('sha256').update(tentativa).digest();
  const b = crypto.createHash('sha256').update(senha || crypto.randomUUID()).digest();
  if (!senha || !crypto.timingSafeEqual(a, b)) {
    try {
      await kvSet(chave, usadas + 1, JANELA_S);
    } catch {
      // ignora
    }
    await new Promise((r) => setTimeout(r, 1200));
    return 'senha';
  }

  const jar = await cookies();
  jar.set(COOKIE, assinatura()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/painel',
    maxAge: 30 * 86_400,
  });
  // Mesmo login libera o atendimento do WhatsApp (/atendimento), se ele tiver senha configurada.
  if (config.whatsapp.painelSenha) await entrarAtendimento();
  return 'ok';
}

export async function sairDoPainel(): Promise<void> {
  (await cookies()).delete({ name: COOKIE, path: '/painel' });
  await sairAtendimento();
}
