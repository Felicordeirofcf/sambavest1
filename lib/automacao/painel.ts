// Login simples do painel /atendimento (senha única em ATENDIMENTO_SENHA).
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { config } from './config';

export const COOKIE_PAINEL = 'sv_atendimento';

function assinatura(): string | null {
  const senha = config.whatsapp.painelSenha;
  if (!senha) return null;
  return crypto.createHmac('sha256', senha).update('painel-atendimento-v1').digest('hex');
}

export function senhaConfere(tentativa: string): boolean {
  const senha = config.whatsapp.painelSenha;
  if (!senha) return false;
  const a = crypto.createHash('sha256').update(tentativa).digest();
  const b = crypto.createHash('sha256').update(senha).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function logado(): Promise<boolean> {
  const esperado = assinatura();
  const atual = (await cookies()).get(COOKIE_PAINEL)?.value;
  if (!esperado || !atual || atual.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(atual), Buffer.from(esperado));
}

export async function entrar(): Promise<void> {
  (await cookies()).set(COOKIE_PAINEL, assinatura()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // lax: o login vale também ao abrir o painel por um link (alerta no WhatsApp/Telegram, e-mail).
    // As ações do painel continuam protegidas (o Next confere a origem de cada envio de formulário).
    sameSite: 'lax',
    path: '/atendimento',
    maxAge: 365 * 86_400, // fica logado por 1 ano (até sair ou trocar a senha)
  });
}

export async function sair(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_PAINEL, path: '/atendimento' });
}
