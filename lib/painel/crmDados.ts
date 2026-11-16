// Junta o CRM do WhatsApp com os pedidos do WooCommerce (pelo telefone).
import { listarConversas } from '../automacao/conversas';
import { integracoes } from '../automacao/config';
import { kvGet, kvSet } from '../automacao/kv';
import { chaveTelefone } from '../automacao/whatsapp';
import { ContatoCrm, Etapa, importarConversas, listarContatos, obterContato, salvarContato } from './crm';
import { pedidosRecentes, PedidoResumo, STATUS_PAGO } from './dados';

export type ContatoComPedidos = ContatoCrm & {
  pedidosWoo: PedidoResumo[];
  pagos: number;
  gasto: number;
  pendentes: number;
};

/** Importa conversas antigas para o CRM no máximo a cada 10 minutos. */
async function importarSePreciso(): Promise<void> {
  if (!integracoes.kv()) return;
  if (await kvGet<number>('crm:importado').catch(() => null)) return;
  await importarConversas(await listarConversas(300));
  await kvSet('crm:importado', 1, 600);
}

export function pedidosPorTelefone(pedidos: PedidoResumo[]): Map<string, PedidoResumo[]> {
  const mapa = new Map<string, PedidoResumo[]>();
  for (const p of pedidos) {
    const k = chaveTelefone(p.cliente.telefone);
    if (!k) continue;
    mapa.set(k, [...(mapa.get(k) || []), p]);
  }
  return mapa;
}

export function enriquecer(c: ContatoCrm, porTel: Map<string, PedidoResumo[]>): ContatoComPedidos {
  const ps = (porTel.get(c.chave) || []).sort((a, b) => b.criado - a.criado);
  const pagos = ps.filter((p) => STATUS_PAGO.includes(p.status));
  return {
    ...c,
    pedidosWoo: ps,
    pagos: pagos.length,
    gasto: pagos.reduce((s, p) => s + p.total, 0),
    pendentes: ps.filter((p) => p.status === 'pending').length,
  };
}

/** Em que coluna do quadro o pedido coloca o cliente. */
export function etapaDoPedido(p: PedidoResumo): Etapa | null {
  if (p.status === 'completed' || p.marcas.rastreio || p.marcas.avisoEnviado) return 'enviado';
  if (p.status === 'processing') return 'cliente';
  if (p.status === 'pending' || p.status === 'on-hold') return 'pagamento';
  if (p.status === 'cancelled' || p.status === 'failed') return 'perdido';
  return null;
}

/** Telefone no formato do WhatsApp (55 + DDD + número). */
function numeroWhatsapp(tel: string): string {
  const d = tel.replace(/\D/g, '').replace(/^0+/, '');
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}

/** Quantos dias de pedidos entram sozinhos no quadro. */
const DIAS_NO_QUADRO = 90;

/**
 * Todo pedido (gerado, pago, enviado) vira cartão no quadro, mesmo sem conversa no WhatsApp.
 * O cartão anda sozinho quando o pedido muda de situação; se o pedido não mudou, fica onde a loja
 * arrastou. Só grava no banco o que mudou.
 */
export async function sincronizarPedidosNoCrm(porTel: Map<string, PedidoResumo[]>, agora = Date.now()): Promise<number> {
  let mudou = 0;
  for (const [chave, ps] of porTel) {
    const ultimo = [...ps].sort((a, b) => b.criado - a.criado)[0];
    if (!ultimo || agora - ultimo.criado > DIAS_NO_QUADRO * 86_400_000) continue;
    const etapa = etapaDoPedido(ultimo);
    if (!etapa) continue;
    const marca = `${ultimo.id}:${etapa}`;
    const atividade = Math.max(ultimo.criado, ultimo.pago || 0);
    const atual = await obterContato(chave);
    if (atual?.marcaPedido === marca) continue;
    const c: ContatoCrm = atual || {
      chave,
      numero: numeroWhatsapp(ultimo.cliente.telefone),
      nome: ultimo.cliente.nome !== 'Sem nome' ? ultimo.cliente.nome : undefined,
      etapa,
      etiquetas: [],
      notas: [],
      criadoEm: ultimo.criado,
      ultimaAtividade: atividade,
      naoLidas: 0,
      mensagensCliente: 0,
    };
    c.etapa = etapa;
    c.marcaPedido = marca;
    c.ultimaAtividade = Math.max(c.ultimaAtividade || 0, atividade);
    if (!c.nome && ultimo.cliente.nome !== 'Sem nome') c.nome = ultimo.cliente.nome;
    c.pedidos = [...new Set([...(c.pedidos || []), ...ps.map((p) => p.id)])].slice(-20);
    await salvarContato(c);
    mudou++;
  }
  return mudou;
}

export async function contatosCrm(): Promise<{ contatos: ContatoComPedidos[]; erroPedidos: string }> {
  await importarSePreciso().catch(() => undefined);
  let erroPedidos = '';
  let porTel = new Map<string, PedidoResumo[]>();
  try {
    porTel = pedidosPorTelefone(await pedidosRecentes(365));
    await sincronizarPedidosNoCrm(porTel).catch(() => undefined);
  } catch (e) {
    erroPedidos = (e as Error).message;
  }
  const lista = await listarContatos(1000);
  return { contatos: lista.map((c) => enriquecer(c, porTel)), erroPedidos };
}
