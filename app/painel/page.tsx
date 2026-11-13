import Link from 'next/link';
import AutoAtualizar from '../../components/painel/AutoAtualizar';
import { Kpi } from '../../components/painel/Kpi';
import { diasDoIntervalo, intervaloDoPeriodo, kpisDoIntervalo, pagosNoIntervalo, PERIODOS_PAINEL, type ChavePeriodoPainel } from '../../lib/painel/periodo';
import PagamentosAbas, { type LinhaPagamento } from '../../components/painel/PagamentosAbas';
import { linkWhats, mensagensDoPedido } from '../../lib/painel/mensagensWhats';
import { Colunas, Funil, MapaBrasil, Medidor, PlacarDuelo } from '../../components/painel/analytics';
import { Aviso, Barras, Cartao, brl, dataHora } from '../../components/painel/ui';
import { listarAbandonos } from '../../lib/automacao/abandono';
import { montarMonitoramento } from '../../lib/painel/monitoramento';
import { config, integracoes } from '../../lib/automacao/config';
import { telefoneWhatsapp } from '../../lib/automacao/whatsapp';
import { placarDuelo } from '../../lib/blackfriday';
import { faseBF, PERIODO_BF } from '../../lib/blackfridayPeriodo';
import {
  acabandoPrimeiro,
  blackFriday,
  colunasPorDia,
  colunasPorHora,
  dueloVendas,
  porEstado,
  quando,
  rankingCamisas,
  rankingTamanhos,
  ultimosDias,
} from '../../lib/painel/analytics';
import { exigirLogin } from '../../lib/painel/auth';
import { dadosDeReserva, estoque as lerEstoque, LinhaEstoque, pedidosRecentes } from '../../lib/painel/dados';
import { NOME_ETAPA, somaFunil } from '../../lib/painel/funil';
import { diaLocal, pago, pendencias, variacao } from '../../lib/painel/metricas';
import { atualizarDados, marcarChamadoRecuperar } from './actions';
import { quandoChamados } from '../../lib/painel/recuperar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Hora da consulta (página dinâmica, renderizada a cada acesso). */
const agoraMs = () => Date.now();
const DIA = 86_400_000;
const GRAFICOS = { hoje: 'Hoje, por hora', '7': '7 dias', '30': '30 dias', bf: 'Black Friday' } as const;
type Grafico = keyof typeof GRAFICOS;

function saudacao(ms: number): string {
  const h = Number(new Date(ms).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24;
  return h < 12 ? 'Bom dia!' : h < 18 ? 'Boa tarde!' : 'Boa noite!';
}

const haQuanto = (ms: number, agora: number) => {
  const min = Math.round((agora - ms) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
};

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<{ grafico?: string; p?: string }> }) {
  await exigirLogin();
  const agora = agoraMs();
  const naBlack = faseBF(agora) === 'durante';
  const sp = await searchParams;
  const pedido = sp.grafico as Grafico | undefined;
  const chavePeriodo: ChavePeriodoPainel = sp.p && sp.p in PERIODOS_PAINEL ? (sp.p as ChavePeriodoPainel) : 'hoje';
  const intervalo = intervaloDoPeriodo(chavePeriodo, agora);
  const grafico: Grafico = pedido && pedido in GRAFICOS ? pedido : naBlack ? 'bf' : '30';

  if (!integracoes.woo()) {
    return <Aviso tipo="erro">WooCommerce não configurado (WC_CONSUMER_KEY / WC_CONSUMER_SECRET).</Aviso>;
  }

  let erro = '';
  let pedidos: Awaited<ReturnType<typeof pedidosRecentes>> = [];
  try {
    pedidos = await pedidosRecentes(60);
  } catch (e) {
    erro = (e as Error).message;
  }
  const reserva = dadosDeReserva();
  let estoque: LinhaEstoque[] | null = null;
  try {
    estoque = await lerEstoque();
  } catch {
    // segue sem estoque
  }

  // ---- Black Friday ----
  const bf = blackFriday(pedidos, estoque, agora);
  const votos = await placarDuelo().catch(() => ({ 'beija-flor': 0, viradouro: 0 }));
  const vendasDuelo = dueloVendas(bf.pedidos);

  // ---- Gráfico ----
  // Dias de calendário da Black até hoje (ou até 30/11, depois que ela acabar)
  const fimGrafico = Math.min(agora, PERIODO_BF.fim.getTime());
  const diasBF = ultimosDias(Math.max(1, Math.round((Date.parse(diaLocal(fimGrafico)) - Date.parse(diaLocal(PERIODO_BF.inicio.getTime()))) / DIA) + 1), fimGrafico);
  const colunas =
    grafico === 'hoje'
      ? colunasPorHora(pedidos, agora)
      : colunasPorDia(pedidos, grafico === 'bf' ? diasBF : ultimosDias(Number(grafico), agora));

  // ---- Rankings, mapa e funil: período da Black (ou 30 dias fora dela) ----
  const nomePeriodo = PERIODOS_PAINEL[chavePeriodo].toLowerCase();
  const pagosPeriodo = pagosNoIntervalo(pedidos, intervalo.inicio, intervalo.fim);
  // ---- Cards do período escolhido × período anterior ----
  const kAtual = kpisDoIntervalo(pedidos, intervalo.inicio, intervalo.fim);
  const kAnt = kpisDoIntervalo(pedidos, intervalo.antInicio, intervalo.antFim);
  const [visAtual, visAnt] = integracoes.kv()
    ? await Promise.all([
        somaFunil(diasDoIntervalo(intervalo.inicio, intervalo.fim)).then((f) => f.visita).catch(() => 0),
        somaFunil(diasDoIntervalo(intervalo.antInicio, intervalo.antFim)).then((f) => f.visita).catch(() => 0),
      ])
    : [0, 0];
  const convAtual = visAtual ? kAtual.pedidos / visAtual : null;
  const convAnt = visAnt ? kAnt.pedidos / visAnt : null;
  const pct1 = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const dec = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtData = (ms: number) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const camisas = rankingCamisas(pagosPeriodo);
  const tamanhos = rankingTamanhos(pagosPeriodo, estoque);
  const acabando = estoque ? acabandoPrimeiro(pedidos, estoque, agora) : [];
  const estados = porEstado(pagosPeriodo);
  const diasFunil = diasDoIntervalo(intervalo.inicio, intervalo.fim);
  const funil = integracoes.kv() ? await somaFunil(diasFunil) : null;
  const pagosFunil = pedidos.filter((p) => pago(p) && diasFunil.includes(diaLocal(quando(p)))).length;

  // ---- Pagamentos (abas: Pix/cartão pago e não pago, cancelados) e pendências ----
  const linhasPagamento: LinhaPagamento[] = pedidos
    .filter((p) => agora - p.criado < 7 * 86_400_000 && p.status !== 'checkout-draft')
    .sort((a, b) => b.criado - a.criado)
    .flatMap((p): LinhaPagamento[] => {
      const ehPixP = p.metodo.includes('pix');
      const grupo: LinhaPagamento['grupo'] | null = ['cancelled', 'refunded'].includes(p.status)
        ? 'cancelado'
        : pago(p)
          ? ehPixP ? 'pix-pago' : 'cartao-pago'
          : ['pending', 'on-hold', 'failed'].includes(p.status)
            ? ehPixP ? 'pix-aberto' : 'cartao-aberto'
            : null;
      if (!grupo) return [];
      const wa = telefoneWhatsapp(p.cliente.telefone);
      const msg = grupo === 'cancelado' ? null : mensagensDoPedido(p).find((m) => m.destaque) || null;
      return [{
        id: p.id,
        grupo,
        cliente: p.cliente.nome,
        total: brl(p.total),
        quando: pago(p) && p.pago ? `pago ${haQuanto(p.pago, agora)}` : `feito ${haQuanto(p.criado, agora)}`,
        detalhe: p.status === 'failed' ? 'pagamento recusado' : p.status === 'refunded' ? 'reembolsado' : undefined,
        whatsapp: wa && msg ? linkWhats(wa, msg.texto) : undefined,
      }];
    });
  const pend = pendencias(pedidos, {
    bling: integracoes.bling() && config.bling.enviarPedidos,
    envios: integracoes.melhorEnvio() && config.melhorEnvio.criarEnvios,
  });

  const abandonos = integracoes.kv() ? await listarAbandonos(72).catch(() => []) : [];

  // ---- Recuperar vendas: carrinhos abandonados + pedidos não pagos (72 h) ----
  type Recuperar = {
    k: string; tipo: 'sacola' | 'pedido'; pedidoId?: number; rotuloPedido?: string; nome: string; total: number;
    itens: string; quando: number; origem?: string; extra?: string; whatsapp?: string; semTelefone?: string; chamadoEm?: number | null;
  };
  const listaRecuperar: Recuperar[] = [
    ...abandonos
      .filter((a) => !a.convertido && !a.sair)
      .map((a): Recuperar => {
        const wa = a.telefone ? telefoneWhatsapp(a.telefone) : null;
        const primeiro = (a.nome || '').split(' ')[0];
        const msg = `Oi${primeiro ? ` ${primeiro}` : ''}! Aqui é da Samba Vest. Vi que você deixou ${a.itens[0]?.nome || 'uma camisa'} na sacola. Posso te ajudar a finalizar? Qualquer dúvida de tamanho ou frete, é só me falar.`;
        return {
          k: `a:${a.id}`, tipo: 'sacola', nome: a.nome || a.email, total: a.total,
          itens: a.itens.map((i) => `${i.qtd}x ${i.nome}`).join(', '), quando: a.atualizadoEm, origem: a.origem,
          extra: a.emails ? `${a.emails} e-mail(s) enviado(s)` : 'e-mail em breve',
          whatsapp: wa ? linkWhats(wa, msg) : undefined, semTelefone: 'sem telefone (só e-mail)',
        };
      }),
    ...pedidos
      .filter((p) => ['pending', 'on-hold', 'failed'].includes(p.status) && agora - p.criado < 72 * 3_600_000)
      .map((p): Recuperar => {
        const wa = telefoneWhatsapp(p.cliente.telefone);
        const msg = mensagensDoPedido(p).find((m) => m.destaque);
        const pix = p.metodo.includes('pix');
        return {
          k: `p:${p.id}`, tipo: 'pedido', pedidoId: p.id,
          rotuloPedido: p.status === 'failed' ? 'cartão recusado' : pix ? 'Pix não pago' : 'cartão não pago',
          nome: p.cliente.nome, total: p.total, itens: p.itens.map((i) => `${i.qtd}x ${i.nome}`).join(', '), quando: p.criado,
          origem: p.origem?.source, whatsapp: wa && msg ? linkWhats(wa, msg.texto) : undefined, semTelefone: 'sem telefone',
        };
      }),
  ].sort((a, b) => b.quando - a.quando);
  const chamados = integracoes.kv() ? await quandoChamados(listaRecuperar.map((r) => r.k)) : {};
  // Os ainda não chamados primeiro
  const recuperar = listaRecuperar
    .map((r) => ({ ...r, chamadoEm: chamados[r.k] ?? null }))
    .sort((a, b) => Number(Boolean(a.chamadoEm)) - Number(Boolean(b.chamadoEm)) || b.quando - a.quando);

  const servicos = await montarMonitoramento({ pedidos, erro, pend, agora });
  const servicosComProblema = servicos.filter((x) => x.estado === 'erro' || x.estado === 'atencao');


  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            {fmtData(intervalo.inicio)} até {fmtData(intervalo.fim)}
          </span>
          <h1 className="mt-3 text-3xl md:text-4xl">Performance de vendas</h1>
          <p className="mt-1 text-sm text-slate-500">
            {saudacao(agora)} Pedidos pagos do WooCommerce · atualizado {dataHora(agora)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <nav aria-label="Período" className="flex flex-wrap justify-end gap-1.5">
            {(Object.keys(PERIODOS_PAINEL) as ChavePeriodoPainel[])
              .filter((k) => k !== 'black' || naBlack)
              .map((k) => (
                <Link
                  key={k}
                  href={`/painel?p=${k}`}
                  aria-current={k === chavePeriodo ? 'page' : undefined}
                  className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                    k === chavePeriodo ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {PERIODOS_PAINEL[k]}
                </Link>
              ))}
          </nav>
          <div className="flex items-center gap-2">
            <AutoAtualizar segundos={60} />
            <form action={atualizarDados}>
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">Atualizar agora</button>
            </form>
          </div>
        </div>
      </div>

      {erro && <Aviso tipo="erro">Não consegui ler os pedidos do WooCommerce: {erro}</Aviso>}
      {!erro && reserva && (
        <Aviso>O WooCommerce não respondeu agora. Mostrando os dados de {dataHora(reserva)}; a tela tenta de novo sozinha.</Aviso>
      )}

      {/* Indicadores do período × período anterior */}
      <section aria-label="Indicadores">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi rotulo="Faturamento" icone="faturamento" valor={brl(kAtual.faturamento)} anterior={brl(kAnt.faturamento)} delta={variacao(kAtual.faturamento, kAnt.faturamento)} href="#grafico" />
          <Kpi rotulo="Pedidos pagos" icone="pedidos" valor={String(kAtual.pedidos)} anterior={String(kAnt.pedidos)} delta={variacao(kAtual.pedidos, kAnt.pedidos)} href="/painel/pedidos" />
          <Kpi rotulo="Ticket médio" icone="ticket" valor={brl(kAtual.ticket)} anterior={brl(kAnt.ticket)} delta={variacao(kAtual.ticket, kAnt.ticket)} />
          <Kpi rotulo="Peças por pedido" icone="pecas" valor={dec(kAtual.pecasPorPedido)} anterior={dec(kAnt.pecasPorPedido)} delta={variacao(kAtual.pecasPorPedido, kAnt.pecasPorPedido)} ajuda={`${kAtual.pecas} peça(s) no período`} />
          <Kpi
            rotulo="Conversão"
            icone="conversao"
            valor={convAtual === null ? '—' : pct1(convAtual)}
            anterior={convAnt === null ? null : pct1(convAnt)}
            delta={convAtual !== null && convAnt ? variacao(convAtual, convAnt) : null}
            href="#funil"
            ajuda={integracoes.kv() ? `${kAtual.pedidos} venda(s) de ${visAtual} visita(s)` : 'precisa do Upstash'}
          />
        </div>
        <p className="mt-2 text-right text-xs text-slate-400">Comparação: {intervalo.comparacao}</p>
      </section>

      {servicosComProblema.length > 0 && (
        <Aviso tipo={servicosComProblema.some((x) => x.estado === 'erro') ? 'erro' : undefined}>
          {servicosComProblema.length} item(ns) do sistema pedem atenção: {servicosComProblema.map((x) => x.nome).join(', ')}.{' '}
          <Link href="/painel/configuracoes" className="font-semibold underline">Ver em Configurações</Link>
        </Aviso>
      )}

      {/* Black Friday + duelo */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Cartao titulo="🖤 Black Friday" className="lg:col-span-3" acao={<span className="text-xs text-slate-500">11/11 a 30/11</span>}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Numero rotulo="Peças vendidas" valor={String(bf.pecas)} />
            <Numero rotulo="Faturamento" valor={brl(bf.faturamento)} />
            <Numero rotulo="Pedidos" valor={String(bf.vendas)} />
            <Numero rotulo={naBlack ? 'Dias restantes' : 'Situação'} valor={naBlack ? String(bf.diasRestantes) : faseBF(agora) === 'antes' ? 'não começou' : 'encerrada'} />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold">Meta: vender todo o estoque</p>
            {bf.meta !== null ? (
              <>
                <Medidor feito={bf.pecas} total={bf.meta} rotulo="Progresso da meta da Black Friday" />
                <p className="mt-2 text-sm text-slate-600">
                  Restam <b>{bf.restante}</b> peças no estoque.{' '}
                  {naBlack && bf.necessario !== null && (
                    <>
                      Para zerar até 30/11: <b>~{Math.ceil(bf.necessario)} peças/dia</b> (ritmo atual: {bf.ritmo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia).
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-400">Conta só os produtos com &quot;gerenciar estoque&quot; ligado no WooCommerce.</p>
              </>
            ) : (
              <p className="text-sm text-slate-400">Não consegui ler o estoque agora.</p>
            )}
          </div>
        </Cartao>
        <Cartao titulo="Duelo: Beija-Flor × Viradouro" className="lg:col-span-2" acao={<Link href="/black-friday" className="text-xs underline text-sky-800">ver página</Link>}>
          <PlacarDuelo beija={{ votos: votos['beija-flor'], ...vendasDuelo['beija-flor'] }} viradouro={{ votos: votos.viradouro, ...vendasDuelo.viradouro }} />
        </Cartao>
      </div>

      {/* Gráfico */}
      <section id="grafico">
        <Cartao
          titulo="Faturamento (pedidos pagos)"
          acao={
            <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              {(Object.keys(GRAFICOS) as Grafico[]).map((g) => (
                <Link key={g} href={`/painel?grafico=${g}#grafico`} scroll={false} className={`rounded-md px-3 py-1 ${grafico === g ? 'bg-[#0B1B34] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {GRAFICOS[g]}
                </Link>
              ))}
            </div>
          }
        >
          <Colunas colunas={colunas} rotulo={`Faturamento: ${GRAFICOS[grafico]}`} />
        </Cartao>
      </section>

      {/* Rankings */}
      <div id="ranking" className="grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Camisas que mais vendem" acao={<span className="text-xs text-slate-500">{nomePeriodo}</span>}>
          <Barras fatias={camisas} formato="qtd" />
        </Cartao>
        <Cartao titulo="Tamanhos que mais vendem" acao={<span className="text-xs text-slate-500">{nomePeriodo}</span>}>
          <Barras fatias={tamanhos} formato="qtd" />
        </Cartao>
        <Cartao titulo="Vai acabar primeiro" acao={<Link href="/painel/produtos" className="text-xs underline text-sky-800">estoque</Link>}>
          {acabando.length === 0 ? (
            <p className="text-sm text-slate-400">{estoque ? 'Nenhum tamanho acabando no ritmo atual.' : 'Não consegui ler o estoque agora.'}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {acabando.map((l) => (
                <li key={`${l.produtoId}-${l.variacaoId}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.produto}</span>
                    <span className="text-xs text-slate-500">{l.variacao || 'único'}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block font-bold tabular-nums ${l.q === 0 ? 'text-red-700' : l.q < 3 ? 'text-amber-800' : ''}`}>{l.q === 0 ? 'esgotado' : `${l.q} un.`}</span>
                    <span className="text-xs text-slate-500">{l.q === 0 ? '' : Number.isFinite(l.dias) ? `~${Math.max(1, Math.round(l.dias))} dia(s)` : 'sem vendas na semana'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {/* Mapa + funil */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="De onde vêm as compras" acao={<span className="text-xs text-slate-500">{nomePeriodo}</span>}>
          <MapaBrasil dados={estados} />
        </Cartao>
        <section id="funil">
          <Cartao titulo="Funil: onde o cliente desiste" acao={<span className="text-xs text-slate-500">{naBlack ? 'desde 11/11' : '7 dias'}</span>}>
            {funil ? (
              <>
                <Funil
                  etapas={[
                    { nome: NOME_ETAPA.visita, valor: funil.visita },
                    { nome: NOME_ETAPA.produto, valor: funil.produto },
                    { nome: NOME_ETAPA.sacola, valor: funil.sacola },
                    { nome: NOME_ETAPA.checkout, valor: funil.checkout },
                    { nome: NOME_ETAPA.pago, valor: pagosFunil },
                  ]}
                />
                <p className="mt-3 text-xs text-slate-400">
                  Contagem anônima, 1 por pessoa por dia. Começou a contar nesta atualização do painel; os números crescem a partir de agora.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">O funil precisa do Upstash (KV) configurado.</p>
            )}
          </Cartao>
        </section>
      </div>

      <Cartao titulo="Pagamentos (últimos 7 dias)">
        <PagamentosAbas linhas={linhasPagamento} />
      </Cartao>

      <div id="recuperar">
        <Cartao
          titulo={`Recuperar vendas (72 h): ${recuperar.filter((r) => !r.chamadoEm).length} para chamar`}
          acao={<span className="text-xs text-slate-500">{abandonos.filter((a) => a.convertido).length} carrinho(s) recuperado(s) · e-mail automático em 1 h e 24 h</span>}
        >
          {recuperar.length === 0 ? (
            <p className="text-sm text-slate-400">Ninguém para recuperar nas últimas 72 h. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recuperar.slice(0, 20).map((r) => (
                <li key={r.k} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${r.chamadoEm ? 'opacity-60' : ''}`}>
                  <span className="min-w-0">
                    <span className={`mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.tipo === 'sacola' ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900'}`}>
                      {r.tipo === 'sacola' ? 'deixou na sacola' : r.rotuloPedido}
                    </span>
                    {r.pedidoId ? (
                      <Link href={`/painel/pedidos/${r.pedidoId}`} className="font-semibold text-sky-800 underline">#{r.pedidoId}</Link>
                    ) : null}{' '}
                    <b>{r.nome}</b> · {brl(r.total)}
                    <span className="block truncate text-xs text-slate-500">
                      {r.itens} · {haQuanto(r.quando, agora)}
                      {r.origem ? ` · veio de: ${r.origem}` : ''}
                      {r.extra ? ` · ${r.extra}` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    {r.chamadoEm ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">✓ chamado {haQuanto(r.chamadoEm, agora)}</span>
                    ) : (
                      <form action={marcarChamadoRecuperar}>
                        <input type="hidden" name="k" value={r.k} />
                        <button className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">✓ já chamei</button>
                      </form>
                    )}
                    {r.whatsapp ? (
                      <a href={r.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] px-3 py-1.5 font-bold text-black">
                        WhatsApp
                      </a>
                    ) : (
                      <span className="text-slate-400">{r.semTelefone}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {pend.length > 0 && (
        <Cartao titulo="Precisa de atenção">
          <ul className="divide-y divide-slate-100">
            {pend.map((p) => (
              <li key={p.tipo} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <span className="font-medium">
                  <span aria-hidden className="mr-1">
                    ⚠️
                  </span>
                  {p.titulo}: {p.pedidos.length}
                </span>
                <span className="text-sm text-slate-500">{p.dica}</span>
                <span className="flex w-full flex-wrap gap-2 text-sm">
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
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</p>
      <p className="sv-display mt-1 text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  );
}
