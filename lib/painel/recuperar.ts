// "Já chamei": marca no painel quem já foi chamado no WhatsApp para recuperar a venda
// (carrinho abandonado ou pedido não pago), para ninguém receber mensagem duas vezes.
import { kvMGet, kvSet } from '../automacao/kv';

const chave = (k: string) => `recuperar:chamado:${k}`;

export async function marcarChamado(k: string): Promise<void> {
  await kvSet(chave(k), Date.now(), 7 * 86_400);
}

/** Quando cada um foi chamado (ms) ou null. */
export async function quandoChamados(ks: string[]): Promise<Record<string, number | null>> {
  if (!ks.length) return {};
  const v = await kvMGet<number>(ks.map(chave)).catch(() => ks.map(() => null));
  return Object.fromEntries(ks.map((k, i) => [k, v[i] ? Number(v[i]) : null]));
}
