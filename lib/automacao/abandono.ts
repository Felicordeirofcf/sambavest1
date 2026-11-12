// Carrinho abandonado: quem digitou o e-mail no checkout e não finalizou recebe um lembrete
// por e-mail em 1 h e outro em 24 h, com um link que remonta a sacola.
// Guarda só o necessário (e-mail, nome, telefone se digitado, itens) por 4 dias; o cliente pode sair
// da lista pelo link do e-mail. Ao finalizar a compra, o carrinho é marcado como recuperado.
import crypto from 'node:crypto';
import { config, integracoes } from './config';
import { adquirirTrava, kvGet, kvSet, kvZAdd, kvZRevRange } from './kv';
import { enviarEmail, escapar } from './notificacoes';

const VALIDADE_S = 4 * 86_400;
const INDICE = 'abandonos';

export type ItemAbandonado = { id: number; nome: string; qtd: number; preco: number; imagem?: string; tamanho?: string };

export type Abandono = {
  id: string;
  email: string;
  nome?: string;
  telefone?: string;
  itens: ItemAbandonado[];
  total: number;
  origem?: string;
  criadoEm: number;
  atualizadoEm: number;
  convertido?: number; // nº do pedido
  emails: number; // lembretes enviados (0, 1, 2)
  sair?: boolean;
};

const hashEmail = (email: string) => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
const chave = (id: string) => `abandono:${id}`;
const chaveEmail = (email: string) => `abandono:email:${hashEmail(email)}`;

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');

/** Salva ou atualiza o carrinho de quem está no checkout (chamado ao digitar o e-mail). */
export async function salvarAbandono(dados: {
  email: unknown;
  nome?: unknown;
  telefone?: unknown;
  itens?: unknown;
  origem?: unknown;
}): Promise<boolean> {
  const email = texto(dados.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
  const itens: ItemAbandonado[] = (Array.isArray(dados.itens) ? dados.itens : [])
    .slice(0, 20)
    .map((i: Record<string, unknown>) => ({
      id: Math.floor(Number(i?.id)) || 0,
      nome: texto(i?.nome, 140),
      qtd: Math.min(20, Math.max(1, Math.floor(Number(i?.qtd)) || 1)),
      preco: Math.min(5000, Math.max(0, Number(i?.preco) || 0)),
      imagem: typeof i?.imagem === 'string' && /^https?:\/\/|^\//.test(i.imagem) ? i.imagem.slice(0, 400) : undefined,
      tamanho: texto(i?.tamanho, 60) || undefined,
    }))
    .filter((i) => i.id > 0 && i.nome);
  if (itens.length === 0) return false;

  const agora = Date.now();
  const idExistente = await kvGet<string>(chaveEmail(email)).catch(() => null);
  const anterior = idExistente ? await kvGet<Abandono>(chave(idExistente)).catch(() => null) : null;
  // Se a pessoa já comprou ou pediu para sair, um carrinho novo começa do zero (mas respeita o "sair")
  const reaproveita = anterior && !anterior.convertido;
  const a: Abandono = {
    id: reaproveita ? anterior.id : crypto.randomBytes(12).toString('base64url'),
    email,
    nome: texto(dados.nome, 80) || anterior?.nome,
    telefone: texto(dados.telefone, 30) || anterior?.telefone,
    itens,
    total: Math.round(itens.reduce((s, i) => s + i.preco * i.qtd, 0) * 100) / 100,
    origem: texto(dados.origem, 20) || anterior?.origem,
    criadoEm: reaproveita ? anterior.criadoEm : agora,
    atualizadoEm: agora,
    emails: reaproveita ? anterior.emails : 0,
    sair: anterior?.sair,
  };
  await kvSet(chave(a.id), a, VALIDADE_S);
  await kvSet(chaveEmail(email), a.id, VALIDADE_S);
  await kvZAdd(INDICE, agora, a.id);
  return true;
}

/** Ao criar o pedido: o carrinho daquele e-mail deixa de ser "abandonado". */
export async function marcarConvertido(email: string, pedido: number): Promise<void> {
  try {
    const id = await kvGet<string>(chaveEmail(email));
    if (!id) return;
    const a = await kvGet<Abandono>(chave(id));
    if (!a || a.convertido) return;
    a.convertido = pedido;
    a.atualizadoEm = Date.now();
    await kvSet(chave(id), a, VALIDADE_S);
  } catch {
    // não atrapalha o checkout
  }
}

/** Itens para remontar a sacola pelo link do e-mail (sem dados pessoais). */
export async function itensParaRecuperar(id: string): Promise<ItemAbandonado[] | null> {
  if (!/^[\w-]{10,40}$/.test(id)) return null;
  const a = await kvGet<Abandono>(chave(id)).catch(() => null);
  return a && !a.convertido ? a.itens : null;
}

export async function sairDaLista(id: string): Promise<boolean> {
  if (!/^[\w-]{10,40}$/.test(id)) return false;
  const a = await kvGet<Abandono>(chave(id)).catch(() => null);
  if (!a) return false;
  a.sair = true;
  await kvSet(chave(id), a, VALIDADE_S);
  return true;
}

/** Carrinhos das últimas `horas` horas (para o painel). */
export async function listarAbandonos(horas = 72): Promise<Abandono[]> {
  const ids = await kvZRevRange(INDICE, 0, 199).catch(() => [] as string[]);
  const lista = await Promise.all(ids.map((id) => kvGet<Abandono>(chave(id)).catch(() => null)));
  const limite = Date.now() - horas * 3_600_000;
  return lista.filter((a): a is Abandono => Boolean(a) && a!.atualizadoEm >= limite);
}

// ---------- E-mails ----------

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const site = () => config.siteUrl.replace(/\/$/, '');
const absoluta = (src?: string) => (!src ? '' : src.startsWith('/') ? `${site()}${src}` : src);

function emailLembrete(a: Abandono, segundo: boolean): { assunto: string; html: string } {
  const nome = escapar((a.nome || '').split(' ')[0] || '');
  const link = `${site()}/checkout?recuperar=${encodeURIComponent(a.id)}&utm_source=email&utm_medium=carrinho&utm_campaign=abandono${segundo ? '_24h' : '_1h'}`;
  const sair = `${site()}/api/carrinho-abandonado?sair=${encodeURIComponent(a.id)}`;
  const itens = a.itens
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;width:72px">${i.imagem ? `<img src="${escapar(absoluta(i.imagem))}" width="64" height="64" alt="" style="object-fit:contain;background:#f6f6f6;border-radius:8px">` : ''}</td>
        <td style="padding:8px 12px;font-size:14px">${escapar(i.nome)}${i.tamanho ? `<br><span style="color:#666">${escapar(i.tamanho)}</span>` : ''}</td>
        <td style="padding:8px 0;font-size:14px;text-align:right;white-space:nowrap">${i.qtd}x ${brl(i.preco)}</td>
      </tr>`
    )
    .join('');
  const assunto = segundo ? `${nome ? `${nome}, ` : ''}sua camisa ainda está te esperando` : `${nome ? `${nome}, ` : ''}você esqueceu algo na sacola 🥁`;
  const intro = segundo
    ? `<p>Guardamos sua sacola, mas o estoque da Black Friday está acabando e a oferta vale só até 30/11.</p>`
    : `<p>Vimos que você começou a compra e não finalizou. Sua sacola continua salva:</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <p style="font-size:18px"><b>Oi${nome ? `, ${nome}` : ''}!</b></p>
    ${intro}
    <table style="width:100%;border-collapse:collapse">${itens}</table>
    <p style="font-size:16px;text-align:right"><b>Total: ${brl(a.total)}</b> <span style="color:#666">+ frete</span></p>
    <p style="text-align:center;margin:24px 0"><a href="${escapar(link)}" style="background:#111;color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">Finalizar minha compra</a></p>
    <p style="color:#666;font-size:13px">Ficou com dúvida de tamanho ou frete? Responda este e-mail ou fale com a gente no WhatsApp (21) 99695-9903.</p>
    <p style="color:#999;font-size:11px;margin-top:28px">Você recebeu este e-mail porque começou uma compra em sambavest.com. <a href="${escapar(sair)}" style="color:#999">Não quero mais receber estes lembretes</a>.</p>
  </div>`;
  return { assunto, html };
}

export type ResultadoAbandono = { enviados1h: number; enviados24h: number };

/** Rotina (cron a cada 15 min): manda os lembretes de 1 h e 24 h. */
export async function rotinaAbandono(prazo: number): Promise<ResultadoAbandono> {
  const r: ResultadoAbandono = { enviados1h: 0, enviados24h: 0 };
  if (!integracoes.email() || !integracoes.kv()) return r;
  const agora = Date.now();
  for (const a of await listarAbandonos(72)) {
    if (Date.now() > prazo) break;
    if (a.convertido || a.sair) continue;
    const idade = agora - a.atualizadoEm;
    const passo = a.emails === 0 && idade >= 3_600_000 ? 1 : a.emails === 1 && agora - a.criadoEm >= 24 * 3_600_000 && idade >= 3_600_000 ? 2 : 0;
    if (!passo) continue;
    if (!(await adquirirTrava(`abandono:envio:${a.id}:${passo}`, 3 * 86_400))) continue;
    try {
      const { assunto, html } = emailLembrete(a, passo === 2);
      if (await enviarEmail(a.email, assunto, html)) {
        a.emails = passo;
        await kvSet(chave(a.id), a, VALIDADE_S);
        if (passo === 1) r.enviados1h++;
        else r.enviados24h++;
      }
    } catch (e) {
      console.error('[abandono] e-mail', (e as Error).message);
    }
  }
  return r;
}
