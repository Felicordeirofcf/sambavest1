// Conferência (só leitura) do estoque: site (WooCommerce) × Bling × vendido, por produto e modelo.
// Serve para comparar com as notas de compra. Log público: só nomes de produto, SKUs e quantidades.
import { estoque, pedidosRecentes, skusBling } from '../painel/dados';

const STATUS_PAGO = ['processing', 'completed'];

export async function conferirEstoque(diasVendas = 120) {
  const [linhas, bling, pedidos] = await Promise.all([estoque(), skusBling(), pedidosRecentes(diasVendas).catch(() => [])]);
  const vendidos = new Map<number, number>();
  for (const p of pedidos.filter((x) => STATUS_PAGO.includes(x.status)))
    for (const i of p.itens) vendidos.set(i.variacao || i.produto, (vendidos.get(i.variacao || i.produto) || 0) + i.qtd);

  type Grupo = { produto: string; modelo: string; variacoes: number; site: number; bling: number; semBling: string[]; diferentes: string[]; vendidos: number; semControle: number };
  const grupos = new Map<string, Grupo>();
  for (const l of linhas) {
    const modelo = l.variacao.split(' / ')[0] || '—';
    const k = `${l.produto}|${modelo}`;
    const g = grupos.get(k) || { produto: l.produto, modelo, variacoes: 0, site: 0, bling: 0, semBling: [], diferentes: [], vendidos: 0, semControle: 0 };
    g.variacoes++;
    if (!l.gerencia || l.quantidade === null) g.semControle++;
    g.site += l.quantidade || 0;
    const saldo = l.sku ? bling.mapa?.get(l.sku) : undefined;
    if (saldo === undefined || saldo === null) g.semBling.push(l.sku || `(sem SKU) ${l.variacao}`);
    else {
      g.bling += saldo;
      if (saldo !== (l.quantidade || 0)) g.diferentes.push(`${l.sku}: site ${l.quantidade ?? '—'} × Bling ${saldo}`);
    }
    g.vendidos += vendidos.get(l.variacaoId || l.produtoId) || 0;
    grupos.set(k, g);
  }
  const lista = [...grupos.values()].sort((a, b) => a.produto.localeCompare(b.produto) || a.modelo.localeCompare(b.modelo));
  return {
    erroBling: bling.erro || null,
    janelaVendasDias: diasVendas,
    totais: {
      site: lista.reduce((s, g) => s + g.site, 0),
      bling: lista.reduce((s, g) => s + g.bling, 0),
      vendidos: lista.reduce((s, g) => s + g.vendidos, 0),
    },
    grupos: lista.map((g) => ({ ...g, semBling: g.semBling.slice(0, 10), diferentes: g.diferentes.slice(0, 10) })),
  };
}
