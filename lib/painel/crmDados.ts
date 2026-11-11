// Junta o CRM do WhatsApp com os pedidos do WooCommerce (pelo telefone).
import { listarConversas } from '../automacao/conversas';
import { integracoes } from '../automacao/config';
import { kvGet, kvSet } from '../automacao/kv';
import { chaveTelefone } from '../automacao/whatsapp';
import { ContatoCrm, importarConversas, listarContatos } from './crm';
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

export async function contatosCrm(): Promise<{ contatos: ContatoComPedidos[]; erroPedidos: string }> {
  await importarSePreciso().catch(() => undefined);
  const lista = await listarContatos(1000);
  let erroPedidos = '';
  let porTel = new Map<string, PedidoResumo[]>();
  try {
    porTel = pedidosPorTelefone(await pedidosRecentes(365));
  } catch (e) {
    erroPedidos = (e as Error).message;
  }
  return { contatos: lista.map((c) => enriquecer(c, porTel)), erroPedidos };
}
