import Link from 'next/link';
import AutoAtualizar from '../../components/painel/AutoAtualizar';
import PagamentosAbas, { type LinhaPagamento } from '../../components/painel/PagamentosAbas';
import { linkWhats, mensagensDoPedido } from '../../lib/painel/mensagensWhats';
import { CardAoVivo, Colunas, EstadoServico, Funil, LinhaServico, MapaBrasil, Medidor, PlacarDuelo } from '../../components/painel/analytics';
import { Aviso, Barras, Cartao, brl, dataHora } from '../../components/painel/ui';
import { listarAbandonos } from '../../lib/automacao/abandono';
import { alertasLigados, chatTelegram } from '../../lib/automacao/alertas';
import { falhasNosDias, TIPOS_FALHA, type TipoFalha } from '../../lib/automacao/monitor';
import { ultimaSaude } from '../../lib/automacao/saude';
import { config, integracoes } from '../../lib/automacao/config';
import { ultimaExecucao } from '../../lib/automacao/monitor';
import { telefoneWhatsapp } from '../../lib/automacao/whatsapp';
import { placarDuelo } from '../../lib/blackfriday';
import { faseBF, PERIODO_BF } from '../../lib/blackfridayPeriodo';
import {
  acabandoPrimeiro,
  blackFriday,
  colunasPorDia,
  colunasPorHora,
  dueloVendas,
  hojeVsOntem,
  porEstado,
  quando,
  rankingCamisas,
  rankingTamanhos,
  seriesDiarias,
  ultimosDias,
} from '../../lib/painel/analytics';
import { exigirLogin } from '../../lib/painel/auth';
import { dadosDeReserva, estoque as lerEstoque, LinhaEstoque, pedidosRecentes } from '../../lib/painel/dados';
import { funilPorDia, NOME_ETAPA, somaFunil } from '../../lib/painel/funil';
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

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<{ grafico?: string }> }) {
  await exigirLogin();
  const agora = agoraMs();
  const naBlack = faseBF(agora) === 'durante';
  const pedido = (await searchParams).grafico as Grafico | undefined;
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

  // ---- Cards de hoje ----
  const dias14 = ultimosDias(14, agora);
  const { hoje, ontem } = hojeVsOntem(pedidos, agora);
  const series = seriesDiarias(pedidos, dias14);
  const funilDias = integracoes.kv() ? await funilPorDia(dias14) : null;
  const visitasHoje = funilDias?.[13].visita || 0;
  const visitasOntem = funilDias?.[12].visita || 0;
  const pagosOntemDia = series[12].vendas;
  const convHoje = visitasHoje ? hoje.vendas / visitasHoje : null;
  const convOntem = visitasOntem ? pagosOntemDia / visitasOntem : null;
  const serieConv = funilDias ? funilDias.map((f, i) => (f.visita ? series[i].vendas / f.visita : 0)) : series.map(() => 0);

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
  const inicioPeriodo = naBlack ? PERIODO_BF.inicio.getTime() : agora - 30 * DIA;
  const nomePeriodo = naBlack ? 'desde o início da Black' : 'últimos 30 dias';
  const pagosPeriodo = pedidos.filter((p) => pago(p) && quando(p) >= inicioPeriodo);
  const camisas = rankingCamisas(pagosPeriodo);
  const tamanhos = rankingTamanhos(pagosPeriodo, estoque);
  const acabando = estoque ? acabandoPrimeiro(pedidos, estoque, agora) : [];
  const estados = porEstado(pagosPeriodo);
  const diasFunil = naBlack ? diasBF : ultimosDias(7, agora);
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

  // ---- Monitoramento ----
  const [cron, webhook, alerta, chat] = await Promise.all([
    ultimaExecucao('cron'),
    ultimaExecucao('webhook-woo'),
    ultimaExecucao('alerta'),
    chatTelegram().catch(() => undefined),
  ]);
  const contaAds = integracoes.metaAds() ? await (await import('../../lib/automacao/metaAds')).contaAnuncios().catch(() => null) : null;
  const [saude, falhas24h, abandonos] = await Promise.all([
    ultimaSaude(),
    falhasNosDias([diaLocal(agora), diaLocal(agora - DIA)]),
    integracoes.kv() ? listarAbandonos(72).catch(() => []) : Promise.resolve([]),
  ]);

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

  const ultimoPago = pedidos.filter(pago).sort((a, b) => quando(b) - quando(a))[0];
  const recusados24h = pedidos.filter((p) => p.status === 'failed' && agora - p.criado < DIA).length;
  const qtdPend = (tipo: string) => pend.find((p) => p.tipo === tipo)?.pedidos.length || 0;
  const totalFalhas = (Object.keys(falhas24h) as TipoFalha[]).reduce((s, k) => s + falhas24h[k], 0);
  const servicosSaude: { nome: string; estado: EstadoServico; detalhe: string }[] = (saude?.checks || [])
    .filter((c) => c.nome !== 'WooCommerce' && c.nome !== 'Banco rápido (Upstash)')
    .map((c) => ({
      nome: c.nome,
      estado: /não configurado/.test(c.detalhe) ? 'off' : c.ok ? 'ok' : 'erro',
      detalhe: `${c.ok ? `${c.detalhe} em ${(c.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : c.detalhe} · teste ${haQuanto(saude!.em, agora)}`,
    }));
  const servicos: { nome: string; estado: EstadoServico; detalhe: string }[] = [
    ...servicosSaude,
    {
      nome: 'Checkout e frete (até 48 h)',
      estado: falhas24h['frete-erro'] || falhas24h['checkout-erro'] ? 'erro' : totalFalhas ? 'atencao' : 'ok',
      detalhe: totalFalhas
        ? (Object.keys(falhas24h) as TipoFalha[])
            .filter((k) => falhas24h[k])
            .map((k) => `${TIPOS_FALHA[k]}: ${falhas24h[k]}`)
            .join(' · ')
        : 'nenhuma falha de frete ou checkout registrada',
    },
    {
      nome: 'WooCommerce (loja)',
      estado: erro ? 'erro' : 'ok',
      detalhe: erro ? `não respondeu: ${erro}` : `${pedidos.length} pedidos dos últimos 60 dias lidos agora`,
    },
    {
      nome: 'Pagamentos (AppMax)',
      estado: !ultimoPago || agora - quando(ultimoPago) > 2 * DIA || recusados24h >= 3 ? 'atencao' : 'ok',
      detalhe: `${ultimoPago ? `último pagamento aprovado ${haQuanto(quando(ultimoPago), agora)}` : 'nenhum pagamento aprovado em 60 dias'}${recusados24h ? ` · ${recusados24h} recusado(s) nas últimas 24 h` : ''}`,
    },
    {
      nome: 'Rotina automática (cron)',
      estado: !cron ? 'atencao' : !cron.ok ? 'erro' : agora - cron.em < 40 * 60_000 ? 'ok' : agora - cron.em < 3 * 3_600_000 ? 'atencao' : 'erro',
      detalhe: cron ? `última execução ${haQuanto(cron.em, agora)}${cron.ok ? '' : ` · ${cron.detalhe}`}` : 'ainda sem registro (passa a contar depois desta atualização)',
    },
    {
      nome: 'Webhook de pedidos',
      estado: webhook ? 'ok' : 'atencao',
      detalhe: webhook ? `último aviso do WooCommerce ${haQuanto(webhook.em, agora)} (${webhook.detalhe})` : 'ainda sem registro (aparece no próximo pedido)',
    },
    {
      nome: 'Bling',
      estado: !integracoes.bling() ? 'off' : qtdPend('bling') ? 'atencao' : 'ok',
      detalhe: !integracoes.bling() ? 'não configurado' : qtdPend('bling') ? `${qtdPend('bling')} pedido(s) pago(s) ainda sem pedido no Bling` : 'pedidos pagos chegando no Bling',
    },
    {
      nome: 'Melhor Envio',
      estado: !integracoes.melhorEnvio() ? 'off' : qtdPend('me') ? 'atencao' : 'ok',
      detalhe: !integracoes.melhorEnvio() ? 'não configurado' : qtdPend('me') ? `${qtdPend('me')} pedido(s) sem envio criado` : 'envios em dia',
    },
    {
      nome: 'Alertas no celular',
      estado: !alertasLigados() ? 'off' : alerta && !alerta.ok ? 'erro' : integracoes.telegram() && !chat ? 'atencao' : 'ok',
      detalhe: !alertasLigados()
        ? 'conecte o Telegram em Alertas no celular'
        : alerta
          ? `último alerta ${haQuanto(alerta.em, agora)}${alerta.ok ? '' : ` · falhou: ${alerta.detalhe}`}`
          : integracoes.telegram() && !chat
            ? 'robô criado, falta conectar o seu Telegram'
            : 'pronto, nenhum alerta enviado ainda',
    },
    {
      nome: 'Anúncios (Meta)',
      estado: !integracoes.metaAds() ? 'off' : contaAds === null ? 'atencao' : contaAds.status === 1 ? 'ok' : 'erro',
      detalhe: !integracoes.metaAds()
        ? 'cadastre o META_ADS_TOKEN para ver gasto e cliques'
        : contaAds === null
          ? 'não consegui ler a conta de anúncios agora'
          : `${contaAds.status === 1 ? 'conta ativa' : 'conta parada'}${contaAds.saldo ? ` · ${contaAds.saldo}` : ''}`,
    },
    {
      nome: 'Banco rápido (Upstash)',
      estado: integracoes.kv() ? 'ok' : 'erro',
      detalhe: integracoes.kv() ? 'guardando conversas, CRM, funil e travas' : 'não configurado: funil, CRM e travas não funcionam',
    },
  ];

  const pctDelta = (a: number, b: number) => variacao(a, b);

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--sv-ouro-escuro)]">{saudacao(agora)}</p>
          <h1 className="text-3xl md:text-4xl">Como a loja está indo</h1>
          <p className="mt-1 text-sm text-slate-500">Atualizado {dataHora(agora)}</p>
        </div>
        <div className="flex items-center gap-2">
          <AutoAtualizar segundos={60} />
          <form action={atualizarDados}>
            <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Atualizar agora</button>
          </form>
        </div>
      </div>

      {erro && <Aviso tipo="erro">Não consegui ler os pedidos do WooCommerce: {erro}</Aviso>}
      {!erro && reserva && (
        <Aviso>O WooCommerce não respondeu agora. Mostrando os dados de {dataHora(reserva)}; a tela tenta de novo sozinha.</Aviso>
      )}

      {/* Cards de hoje */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardAoVivo rotulo="Vendas hoje" valor={String(hoje.vendas)} delta={pctDelta(hoje.vendas, ontem.vendas)} serie={series.map((s) => s.vendas)} href="/painel/pedidos" />
        <CardAoVivo rotulo="Faturamento hoje" valor={brl(hoje.faturamento)} delta={pctDelta(hoje.faturamento, ontem.faturamento)} serie={series.map((s) => s.faturamento)} href="/painel?grafico=hoje#grafico" />
        <CardAoVivo rotulo="Ticket médio hoje" valor={brl(hoje.ticket)} delta={pctDelta(hoje.ticket, ontem.ticket)} serie={series.map((s) => s.ticket)} href="#ranking" />
        <CardAoVivo
          rotulo="Conversão hoje"
          valor={convHoje === null ? '—' : `${(convHoje * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          delta={convHoje !== null && convOntem ? pctDelta(convHoje, convOntem) : null}
          serie={serieConv}
          href="#funil"
          ajuda={funilDias ? `${hoje.vendas} vendas de ${visitasHoje} visitas` : 'precisa do Upstash'}
        />
      </div>

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

      {/* Pix + monitoramento */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Pagamentos (últimos 7 dias)">
          <PagamentosAbas linhas={linhasPagamento} />
        </Cartao>
        <Cartao titulo="Monitoramento" acao={<Link href="/painel/alertas" className="text-xs underline text-sky-800">alertas no celular</Link>}>
          <ul className="divide-y divide-slate-100">
            {servicos.map((s) => (
              <LinhaServico key={s.nome} nome={s.nome} estado={s.estado} detalhe={s.detalhe} />
            ))}
          </ul>
        </Cartao>
      </div>

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
