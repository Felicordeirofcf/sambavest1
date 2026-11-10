// Sincroniza o estoque do Bling para o WooCommerce, casando pelo código (SKU).
//
// Regras de segurança:
//  - só mexe em produtos/variações do WooCommerce que já têm "Gerenciar estoque" ligado
//    (peças sob encomenda continuam sempre disponíveis);
//  - só mexe em SKUs que existem no Bling;
//  - só envia o que mudou.
import { saldosPorCodigo } from './bling';
import { wc } from './woocommerce';

type WcProdutoEstoque = {
  id: number;
  name: string;
  type: string;
  sku: string;
  manage_stock: boolean | 'parent';
  stock_quantity: number | null;
};

export type RelatorioEstoque = {
  skusNoBling: number;
  atualizados: { sku: string; nome: string; de: number | null; para: number }[];
  semSkuNoBling: string[];
};

async function todos<T>(caminho: string): Promise<T[]> {
  const lista: T[] = [];
  for (let pagina = 1; pagina <= 30; pagina++) {
    const sep = caminho.includes('?') ? '&' : '?';
    const lote = await wc<T[]>(`${caminho}${sep}per_page=100&page=${pagina}`);
    lista.push(...lote);
    if (lote.length < 100) break;
  }
  return lista;
}

export async function sincronizarEstoque(): Promise<RelatorioEstoque> {
  const saldos = await saldosPorCodigo();
  const rel: RelatorioEstoque = { skusNoBling: saldos.size, atualizados: [], semSkuNoBling: [] };

  const produtos = await todos<WcProdutoEstoque>('/products?status=publish');
  const simples: { id: number; stock_quantity: number }[] = [];

  for (const p of produtos) {
    if (p.type === 'variable') {
      const variacoes = await todos<WcProdutoEstoque>(`/products/${p.id}/variations`);
      const mudar: { id: number; stock_quantity: number }[] = [];
      for (const v of variacoes) {
        if (v.manage_stock !== true || !v.sku) continue;
        const saldo = saldos.get(v.sku);
        if (saldo === undefined) {
          rel.semSkuNoBling.push(v.sku);
          continue;
        }
        if (saldo !== v.stock_quantity) {
          mudar.push({ id: v.id, stock_quantity: saldo });
          rel.atualizados.push({ sku: v.sku, nome: p.name, de: v.stock_quantity, para: saldo });
        }
      }
      if (mudar.length) await wc(`/products/${p.id}/variations/batch`, { method: 'POST', body: { update: mudar } });
    } else if (p.manage_stock === true && p.sku) {
      const saldo = saldos.get(p.sku);
      if (saldo === undefined) {
        rel.semSkuNoBling.push(p.sku);
      } else if (saldo !== p.stock_quantity) {
        simples.push({ id: p.id, stock_quantity: saldo });
        rel.atualizados.push({ sku: p.sku, nome: p.name, de: p.stock_quantity, para: saldo });
      }
    }
  }

  for (let i = 0; i < simples.length; i += 100) {
    await wc('/products/batch', { method: 'POST', body: { update: simples.slice(i, i + 100) } });
  }
  return rel;
}
