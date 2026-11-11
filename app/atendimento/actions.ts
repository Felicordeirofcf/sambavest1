'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { responderPeloPainel } from '../../lib/automacao/atendimento';
import { alterarConversa, obterConversa } from '../../lib/automacao/conversas';
import { entrar, logado, sair, senhaConfere } from '../../lib/automacao/painel';

function voltar(numero: string, extra = ''): never {
  redirect(`/atendimento?n=${encodeURIComponent(numero)}${extra}`);
}

export async function login(formData: FormData) {
  if (!senhaConfere(String(formData.get('senha') || ''))) {
    await new Promise((r) => setTimeout(r, 1500)); // atrasa tentativas de adivinhar a senha
    redirect('/atendimento?erro=senha');
  }
  await entrar();
  redirect('/atendimento');
}

export async function logout() {
  await sair();
  redirect('/atendimento');
}

export async function responder(formData: FormData) {
  if (!(await logado())) redirect('/atendimento');
  const numero = String(formData.get('numero') || '');
  const texto = String(formData.get('texto') || '').trim();
  if (!numero || !texto) voltar(numero);
  let erro = '';
  try {
    await responderPeloPainel(numero, texto);
  } catch (e) {
    erro = (e as Error).message;
  }
  revalidatePath('/atendimento');
  voltar(numero, erro ? `&erro=${encodeURIComponent(erro)}` : '');
}

/** Marca como lida. Com devolverAoRobo, o robô volta a responder esta conversa. */
export async function resolver(formData: FormData) {
  if (!(await logado())) redirect('/atendimento');
  const numero = String(formData.get('numero') || '');
  const devolver = formData.get('robo') === '1';
  if (numero && (await obterConversa(numero))) {
    await alterarConversa(numero, (c) => {
      c.naoLidas = 0;
      if (devolver) c.humanoAte = undefined;
    });
  }
  revalidatePath('/atendimento');
  voltar(numero);
}
