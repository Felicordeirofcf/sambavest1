// Diagnóstico (só leitura): onde o Bling guarda o rastreio das etiquetas geradas nele.
// Sai no log público do GitHub Actions: mostra só NOMES de campos e se o valor parece um código
// (mascarado), nunca nomes, endereços ou valores de clientes.
import * as bling from './bling';
import { listarPedidos, meta } from './woocommerce';

function caminhos(obj: unknown, prefixo = '', saida: string[] = [], prof = 0): string[] {
  if (!obj || typeof obj !== 'object' || prof > 5) return saida;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const c = Array.isArray(obj) ? `${prefixo}[${k}]` : prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === 'object') caminhos(v, c, saida, prof + 1);
    else if (/rastre|tracking|codigo|objeto|etiqueta|logistic|volume|servico|id$/i.test(c)) {
      const s = String(v ?? '');
      const pareceCodigo = /^[A-Z0-9]{8,30}$/i.test(s.trim());
      saida.push(`${c} = ${pareceCodigo ? `${s.slice(0, 2)}***${s.slice(-2)}` : s === '' ? '(vazio)' : typeof v === 'number' ? String(v) : '(texto)'}`);
    }
  }
  return saida;
}

export async function diagnosticoBlingRastreio(): Promise<Record<string, unknown>> {
  const pagos = await listarPedidos('processing', new Date(Date.now() - 14 * 86_400_000), 10);
  const r: Record<string, unknown>[] = [];
  for (const p of pagos.slice(0, 3)) {
    const id = Number(meta(p, '_sv_bling_pedido_id'));
    const item: Record<string, unknown> = { pedido: p.id, idBling: id || null };
    if (id) {
      try {
        const pv = await bling.bling<{ data: Record<string, unknown> }>(`/pedidos/vendas/${id}`);
        item.camposPedido = caminhos(pv.data?.transporte, 'transporte');
        item.situacao = (pv.data as { situacao?: unknown })?.situacao ?? null;
        const nota = (pv.data as { notaFiscal?: { id?: number } })?.notaFiscal?.id;
        item.idNota = nota || null;
        if (nota) {
          const nf = await bling.bling<{ data: Record<string, unknown> }>(`/nfe/${nota}`).catch((e) => ({ data: { erro: (e as Error).message } }));
          item.camposNota = caminhos((nf.data as { transporte?: unknown }).transporte ?? nf.data, 'nfe');
        }
        // Logística do Bling: objetos de postagem ligados ao pedido
        const obj = await bling
          .bling<{ data: unknown }>(`/logisticas/objetos?idsPedidosVendas[]=${id}`)
          .catch((e) => ({ data: { erro: (e as Error).message.slice(0, 120) } }));
        item.camposLogistica = caminhos(obj.data, 'logistica');
      } catch (e) {
        item.erro = (e as Error).message.slice(0, 160);
      }
    }
    r.push(item);
  }
  return { pedidos: r };
}
