'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { responderPeloPainel } from '../../lib/automacao/atendimento';
import { linkDeAutorizacao } from '../../lib/automacao/bling';
import { processarPedido } from '../../lib/automacao/pedidos';
import { adicionarNota, obterPedido, salvarNoPedido, wc } from '../../lib/automacao/woocommerce';
import { exigirLogin, sairDoPainel, tentarEntrar } from '../../lib/painel/auth';
import { limparCache } from '../../lib/painel/dados';
import { carregarFinanceiro } from '../../lib/painel/financeiro';

const txt = (f: FormData, k: string) => String(f.get(k) || '').trim();

export async function entrar(formData: FormData) {
  const r = await tentarEntrar(txt(formData, 'senha'));
  if (r !== 'ok') redirect(`/painel/entrar?erro=${r}`);
  redirect('/painel');
}

export async function sair() {
  await sairDoPainel();
  redirect('/painel/entrar');
}

function voltarPedido(id: number, msg: string, tipo: 'ok' | 'erro' = 'ok'): never {
  redirect(`/painel/pedidos/${id}?${tipo}=${encodeURIComponent(msg)}`);
}

function idPedido(formData: FormData): number {
  const id = Number(txt(formData, 'id'));
  if (!Number.isInteger(id) || id <= 0) redirect('/painel/pedidos');
  return id;
}

/** Roda de novo as automações do pedido (Bling, NF-e, envio, avisos). */
export async function reprocessar(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  let msg = '';
  let tipo: 'ok' | 'erro' = 'ok';
  try {
    const rel = await processarPedido(id);
    if (rel.ignorado) msg = `Nada feito: ${rel.ignorado}.`;
    else if (rel.erros.length) {
      tipo = 'erro';
      msg = `Erros: ${rel.erros.join(' | ')}`;
    } else msg = rel.feito.length ? `Feito: ${rel.feito.join(', ')}.` : 'Tudo já estava em dia.';
  } catch (e) {
    tipo = 'erro';
    msg = (e as Error).message;
  }
  await limparCache();
  revalidatePath(`/painel/pedidos/${id}`);
  voltarPedido(id, msg, tipo);
}

/** Informa o código de rastreio à mão; a automação avisa o cliente e conclui o pedido. */
export async function informarRastreio(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  const codigo = txt(formData, 'codigo').toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9]{8,30}$/.test(codigo)) voltarPedido(id, 'Código de rastreio inválido.', 'erro');
  try {
    const pedido = await obterPedido(id);
    await salvarNoPedido(pedido, { _sv_rastreio: codigo });
    const rel = await processarPedido(id);
    await limparCache();
    voltarPedido(id, `Rastreio salvo. ${rel.feito.length ? `Feito: ${rel.feito.join(', ')}.` : ''}${rel.erros.length ? ` Erros: ${rel.erros.join(' | ')}` : ''}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;
    voltarPedido(id, (e as Error).message, 'erro');
  }
}

const STATUS_PERMITIDOS = ['processing', 'completed', 'cancelled', 'on-hold'];

export async function mudarStatus(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  const status = txt(formData, 'status');
  if (!STATUS_PERMITIDOS.includes(status)) voltarPedido(id, 'Status inválido.', 'erro');
  if (status === 'cancelled' && txt(formData, 'confirmar') !== 'sim') {
    voltarPedido(id, 'Marque a confirmação para cancelar o pedido.', 'erro');
  }
  try {
    await wc(`/orders/${id}`, { method: 'PUT', body: { status } });
    await limparCache();
  } catch (e) {
    voltarPedido(id, (e as Error).message, 'erro');
  }
  revalidatePath(`/painel/pedidos/${id}`);
  voltarPedido(id, 'Status atualizado.');
}

export async function anotar(formData: FormData) {
  await exigirLogin();
  const id = idPedido(formData);
  const texto = txt(formData, 'nota');
  if (!texto) voltarPedido(id, 'Escreva a nota.', 'erro');
  const paraCliente = formData.get('cliente') === 'sim';
  try {
    const pedido = await obterPedido(id);
    await adicionarNota(pedido, texto.slice(0, 2000), paraCliente);
  } catch (e) {
    voltarPedido(id, (e as Error).message, 'erro');
  }
  voltarPedido(id, paraCliente ? 'Nota enviada ao cliente por e-mail.' : 'Nota interna salva.');
}

/** Responde o cliente no WhatsApp (só dentro da janela de 24h). */
export async function responderWhatsapp(formData: FormData) {
  await exigirLogin();
  const numero = txt(formData, 'numero').replace(/\D/g, '');
  const texto = txt(formData, 'texto');
  const voltar = txt(formData, 'voltar') || '/painel/clientes';
  const destino = voltar.startsWith('/painel/') ? voltar : '/painel/clientes';
  if (!numero || !texto) redirect(destino);
  let erro = '';
  try {
    await responderPeloPainel(numero, texto.slice(0, 4000));
  } catch (e) {
    erro = (e as Error).message;
  }
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${erro ? `erro=${encodeURIComponent(erro)}` : 'ok=Mensagem%20enviada'}`);
}

export async function atualizarDados() {
  await exigirLogin();
  await limparCache();
  revalidatePath('/painel');
  redirect('/painel');
}

export async function atualizarFinanceiro() {
  await exigirLogin();
  let erro = '';
  try {
    await carregarFinanceiro(true);
  } catch (e) {
    erro = (e as Error).message;
  }
  revalidatePath('/painel/financeiro');
  redirect(erro ? `/painel/financeiro?erro=${encodeURIComponent(erro)}` : '/painel/financeiro');
}

/** Abre a autorização do Bling com um "state" de uso único (o callback só aceita assim). */
export async function conectarBling() {
  await exigirLogin();
  redirect(await linkDeAutorizacao());
}
