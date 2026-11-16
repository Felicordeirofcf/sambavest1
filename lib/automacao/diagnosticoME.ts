// Diagnóstico do Melhor Envio (só leitura): de qual conta é o token, o que há no carrinho e a
// situação dos envios dos pedidos pagos. Sai no log público do GitHub Actions, então só mostra
// e-mail mascarado, IDs e status (sem nomes, endereços ou valores).
import { config } from './config';
import { consultarEnvio, me, pacote } from './melhorenvio';
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
  // Cotação com TODAS as transportadoras da conta (2 camisas), para escolher quais mostrar no site.
  // Sem R$ no log público: só a posição, a diferença em % para a mais barata e o prazo.
  r.servicosNoSite = config.melhorEnvio.servicos.length ? config.melhorEnvio.servicos : 'todos';
  r.agenciasConfiguradasPara = Object.keys(config.melhorEnvio.agencias);
  const origem = (config.melhorEnvio.remetente.cep || '').replace(/\D/g, '');
  const destinos: Record<string, string> = { 'RJ capital': '20040020', 'Serra RJ': '25600000', 'SP capital': '01310100', 'BH': '30130010', 'Salvador': '40020000' };
  const cotacoes: Record<string, unknown> = {};
  for (const [lugar, cep] of Object.entries(destinos)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await me<any[]>('/me/shipment/calculate', {
        method: 'POST',
        body: { from: { postal_code: origem }, to: { postal_code: cep }, package: pacote(2), options: { insurance_value: 198, receipt: false, own_hand: false } },
      });
      const ok = data.filter((c) => !c.error && c.price).sort((x, y) => Number(x.price) - Number(y.price));
      const base = ok.length ? Number(ok[0].price) : 0;
      cotacoes[lugar] = {
        disponiveis: ok.map((c, i) => `${i + 1}º id ${c.id} ${c.company?.name} ${c.name} · ${c.delivery_time} dia(s) · ${i ? `+${Math.round((Number(c.price) / base - 1) * 100)}%` : 'mais barato'}`),
        indisponiveis: data.filter((c) => c.error || !c.price).map((c) => `id ${c.id} ${c.company?.name} ${c.name}: ${String(c.error || 'sem preço').slice(0, 80)}`),
      };
    } catch (e) {
      cotacoes[lugar] = { erro: (e as Error).message.slice(0, 120) };
    }
  }
  r.cotacaoTodasTransportadoras = cotacoes;

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
