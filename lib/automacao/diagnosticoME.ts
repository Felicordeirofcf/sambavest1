// Diagnóstico do Melhor Envio (só leitura): de qual conta é o token, o que há no carrinho e a
// situação dos envios dos pedidos pagos. Sai no log público do GitHub Actions, então só mostra
// e-mail mascarado, IDs e status (sem nomes, endereços ou valores).
import { config } from './config';
import { consultarEnvio, me } from './melhorenvio';
import { listarPedidos, meta } from './woocommerce';

const mascarar = (email?: string) => {
  if (!email || !email.includes('@')) return null;
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}***@${d}`;
};

export async function diagnosticoMelhorEnvio(): Promise<Record<string, unknown>> {
  const r: Record<string, unknown> = { sandbox: config.melhorEnvio.sandbox };
  try {
    const conta = await me<{ email?: string; firstname?: string; document?: string; company_document?: string }>('/me');
    r.conta = { email: mascarar(conta.email), temCpf: Boolean(conta.document), temCnpj: Boolean(conta.company_document) };
  } catch (e) {
    r.conta = { erro: (e as Error).message };
  }
  try {
    const carrinho = await me<{ data?: { id: string; status?: string; tags?: { tag?: string }[] }[]; total?: number } | { id: string }[]>('/me/cart');
    const itens = Array.isArray(carrinho) ? carrinho : carrinho.data || [];
    r.carrinho = { quantidade: itens.length, itens: itens.slice(0, 20).map((i) => ({ id: i.id, status: (i as { status?: string }).status, tags: (i as { tags?: { tag?: string }[] }).tags?.map((t) => t.tag) })) };
  } catch (e) {
    r.carrinho = { erro: (e as Error).message };
  }
  const desde = new Date(Date.now() - 14 * 86_400_000);
  const pagos = await listarPedidos('processing', desde, 50).catch(() => []);
  r.pedidosPagos = await Promise.all(
    pagos.map(async (p) => {
      const idEnvio = meta(p, '_sv_melhorenvio_envio_id');
      const servico = meta(p, '_sv_melhorenvio_servico');
      if (!idEnvio) return { pedido: p.id, envio: null, servicoFrete: servico || null };
      try {
        const e = await consultarEnvio(idEnvio);
        return { pedido: p.id, envio: idEnvio, status: e.status, protocolo: (e as { protocol?: string }).protocol || null };
      } catch (err) {
        return { pedido: p.id, envio: idEnvio, erro: (err as Error).message };
      }
    })
  );
  return r;
}
