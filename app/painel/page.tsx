import Link from 'next/link';
import { Aviso, Barras, Cartao, GraficoDias, Kpi, SeletorPeriodo, brl, dataHora, pct } from '../../components/painel/ui';
import { config, integracoes } from '../../lib/automacao/config';
import { listarConversas } from '../../lib/automacao/conversas';
import { exigirLogin } from '../../lib/painel/auth';
import { pedidosRecentes } from '../../lib/painel/dados';
import { clientes, pendencias, periodos, porMetodo, porUf, resumo, seriePorDia, topProdutos, variacao } from '../../lib/painel/metricas';
import { atualizarDados } from './actions';

const PERIODOS = [7, 30, 90];

/** Hora da consulta (página dinâmica, renderizada a cada acesso). */
const agoraMs = () => Date.now();

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await exigirLogin();
  const dias = PERIODOS.includes(Number((await searchParams).dias)) ? Number((await searchParams).dias) : 30;

  if (!integracoes.woo()) {
    return <Aviso tipo="erro">WooCommerce não configurado (WC_CONSUMER_KEY / WC_CONSUMER_SECRET).</Aviso>;
  }

  let erro = '';
  let todos: Awaited<ReturnType<typeof pedidosRecentes>> = [];
  try {
    todos = await pedidosRecentes(dias * 2);
  } catch (e) {
    erro = (e as Error).message;
  }
  const { atual, anterior } = periodos(todos, dias);
  const r = resumo(atual);
  const ra = resumo(anterior);
  const serie = seriePorDia(atual, dias);
  const pend = pendencias(todos, {
    bling: integracoes.bling() && config.bling.enviarPedidos,
    envios: integracoes.melhorEnvio() && config.melhorEnvio.criarEnvios,
  });

  // Novos x recorrentes: compara com a base de clientes do último ano
  let novos = 0;
  let recorrentes = 0;
  try {
    const base = clientes(await pedidosRecentes(365));
    const inicio = agoraMs() - dias * 86_400_000;
    for (const c of base) {
      const comprouNoPeriodo = c.pedidos.some((p) => p.criado >= inicio && ['processing', 'completed'].includes(p.status));
      if (!comprouNoPeriodo) continue;
      if (c.primeiraCompra && c.primeiraCompra >= inicio) novos++;
      else recorrentes++;
    }
  } catch {
    // segue sem esse dado
  }

  let conversas = { naoLidas: 0, humano: 0 };
  if (integracoes.kv()) {
    try {
      const lista = await listarConversas(100);
      conversas = {
        naoLidas: lista.filter((c) => c.naoLidas > 0).length,
        humano: lista.filter((c) => c.humanoAte && c.humanoAte > agoraMs()).length,
      };
    } catch {
      // ignora
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Visão geral</h1>
          <p className="text-sm text-slate-500">Últimos {dias} dias · atualizado {dataHora(agoraMs())}</p>
        </div>
        <div className="flex items-center gap-2">
          <SeletorPeriodo atual={dias} base="/painel" />
          <form action={atualizarDados}>
            <button className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Atualizar</button>
          </form>
        </div>
      </div>

      {erro && <Aviso tipo="erro">Não consegui ler os pedidos do WooCommerce: {erro}</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Faturamento (pedidos pagos)" valor={brl(r.faturamento)} delta={variacao(r.faturamento, ra.faturamento)} />
        <Kpi rotulo="Pedidos pagos" valor={String(r.pedidosPagos)} delta={variacao(r.pedidosPagos, ra.pedidosPagos)} />
        <Kpi rotulo="Ticket médio" valor={brl(r.ticketMedio)} delta={variacao(r.ticketMedio, ra.ticketMedio)} />
        <Kpi rotulo="Peças vendidas" valor={String(r.pecas)} delta={variacao(r.pecas, ra.pecas)} />
        <Kpi rotulo="Pedidos criados → pagos" valor={pct(r.taxaPagamento)} ajuda={`${r.pedidosPagos} de ${r.pedidosCriados} pedidos`} />
        <Kpi rotulo="Pix pagos / gerados" valor={r.pixGerados ? pct(r.pixPagos / r.pixGerados) : '—'} ajuda={`${r.pixPagos} de ${r.pixGerados}`} />
        <Kpi rotulo="Clientes novos / recorrentes" valor={`${novos} / ${recorrentes}`} ajuda="quem comprou no período" />
        <Kpi rotulo="WhatsApp" valor={`${conversas.naoLidas} não lidas`} ajuda={`${conversas.humano} aguardando uma pessoa`} />
      </div>

      {pend.length > 0 && (
        <Cartao titulo="Precisa de atenção">
          <ul className="divide-y divide-slate-100">
            {pend.map((p) => (
              <li key={p.tipo} className="py-3 flex flex-wrap gap-x-4 gap-y-1 items-baseline">
                <span className="font-medium">
                  <span aria-hidden className="mr-1">⚠️</span>
                  {p.titulo}: {p.pedidos.length}
                </span>
                <span className="text-sm text-slate-500">{p.dica}</span>
                <span className="w-full flex flex-wrap gap-2 text-sm">
                  {p.pedidos.slice(0, 12).map((x) => (
                    <Link key={x.id} href={`/painel/pedidos/${x.id}`} className="underline text-sky-800">
                      #{x.id} {x.cliente.nome.split(' ')[0]}
                    </Link>
                  ))}
                  {p.pedidos.length > 12 && <span className="text-slate-400">+{p.pedidos.length - 12}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao titulo="Faturamento por dia (pedidos pagos)">
        <GraficoDias pontos={serie} />
      </Cartao>

      <div className="grid lg:grid-cols-3 gap-4">
        <Cartao titulo="Produtos mais vendidos">
          <Barras fatias={topProdutos(atual, 8)} formato="qtd" />
        </Cartao>
        <Cartao titulo="Forma de pagamento">
          <Barras fatias={porMetodo(atual)} />
          <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Frete cobrado</dt>
            <dd className="text-right tabular-nums">{brl(r.frete)}</dd>
            <dt className="text-slate-500">Descontos (Pix)</dt>
            <dd className="text-right tabular-nums">{brl(r.descontos)}</dd>
          </dl>
        </Cartao>
        <Cartao titulo="Vendas por estado">
          <Barras fatias={porUf(atual)} />
        </Cartao>
      </div>
    </div>
  );
}
