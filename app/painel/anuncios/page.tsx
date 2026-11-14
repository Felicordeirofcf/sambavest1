import Link from 'next/link';
import AutoAtualizar from '../../../components/painel/AutoAtualizar';
import { Colunas, Diagnostico, Funil, LinhaServico } from '../../../components/painel/analytics';
import { listarAbandonos } from '../../../lib/automacao/abandono';
import { falhasNosDias } from '../../../lib/automacao/monitor';
import { lerMelhorias } from '../../../lib/automacao/melhorias';
import { iaAnunciosDisponivel, lerAnaliseAnuncios, lerDecisoes } from '../../../lib/automacao/agenteAnuncios';
import { AnaliseIA } from '../../../components/painel/AnaliseIA';
import { rotinaMelhorias } from '../../../lib/automacao/alertas';
import { diagnosticar } from '../../../lib/painel/diagnostico';
import { Aviso, Cartao, Kpi, brl, dataHora, pct } from '../../../components/painel/ui';
import { config, integracoes } from '../../../lib/automacao/config';
import { anuncios, contaAnuncios, NOME_STATUS, porDia, STATUS_CONTA, totais, type Periodo } from '../../../lib/automacao/metaAds';
import { quando, ultimosDias } from '../../../lib/painel/analytics';
import { exigirLogin } from '../../../lib/painel/auth';
import { pedidosRecentes } from '../../../lib/painel/dados';
import { somaFunil } from '../../../lib/painel/funil';
import { NOME_SINAL, SINAIS_BF, somaSinais } from '../../../lib/painel/comportamentoBF';
import { diaLocal, pago } from '../../../lib/painel/metricas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const agoraMs = () => Date.now();
const DIA = 86_400_000;
const PERIODOS = { hoje: 'Hoje', '7': '7 dias', black: 'Desde 12/11', '30': '30 dias' } as const;
type ChavePeriodo = keyof typeof PERIODOS;

const num = (v: number) => v.toLocaleString('pt-BR');

function periodo(chave: ChavePeriodo, agora: number): { p: Periodo; dias: string[] } {
  const hoje = diaLocal(agora);
  if (chave === 'hoje') return { p: { desde: hoje, ate: hoje }, dias: [hoje] };
  if (chave === 'black') {
    // A campanha começou em 12/11
    const inicio = '2026-11-12';
    const n = Math.max(1, Math.round((Date.parse(hoje) - Date.parse(inicio)) / DIA) + 1);
    const dias = ultimosDias(n, agora);
    return { p: { desde: dias[0], ate: hoje }, dias };
  }
  const dias = ultimosDias(Number(chave), agora);
  return { p: { desde: dias[0], ate: hoje }, dias };
}

export default async function AnunciosPage({ searchParams }: { searchParams: Promise<{ periodo?: string; erroIA?: string }> }) {
  await exigirLogin();
  const agora = agoraMs();
  const sp = await searchParams;
  const pedido = sp.periodo as ChavePeriodo | undefined;
  const chave: ChavePeriodo = pedido && pedido in PERIODOS ? pedido : 'black';
  const { p, dias } = periodo(chave, agora);

  // ---------- Lado do site (funciona mesmo sem o token da Meta) ----------
  let pedidos: Awaited<ReturnType<typeof pedidosRecentes>> = [];
  let erroSite = '';
  try {
    pedidos = await pedidosRecentes(60);
  } catch (e) {
    erroSite = (e as Error).message;
  }
  const doAnuncio = pedidos.filter((x) => x.origem?.source === 'meta' && dias.includes(diaLocal(quando(x))));
  const pagosAnuncio = doAnuncio.filter(pago);
  const faturamentoAnuncio = pagosAnuncio.reduce((s, x) => s + x.total, 0);
  const funilSite = integracoes.kv() ? await somaFunil(dias, 'meta').catch(() => null) : null;
  // O que fazem na página da Black (todos × vindos do anúncio)
  const [bfTodos, bfAnuncio] = integracoes.kv()
    ? await Promise.all([somaSinais(dias).catch(() => null), somaSinais(dias, 'meta').catch(() => null)])
    : [null, null];

  // ---------- Lado da Meta ----------
  // Cada parte separada: uma permissão negada não derruba a tela inteira, e o erro diz qual parte falhou
  const errosMeta: string[] = [];
  let contaInfo: Awaited<ReturnType<typeof contaAnuncios>> | null = null;
  let tot: Awaited<ReturnType<typeof totais>> | null = null;
  let serie: Awaited<ReturnType<typeof porDia>> = [];
  let lista: Awaited<ReturnType<typeof anuncios>> = [];
  if (integracoes.metaAds()) {
    const [rConta, rTot, rSerie, rLista] = await Promise.allSettled([contaAnuncios(), totais(p), porDia(p), anuncios(p)]);
    const motivo = (r: PromiseRejectedResult) => (r.reason as Error)?.message || String(r.reason);
    if (rConta.status === 'fulfilled') contaInfo = rConta.value;
    else errosMeta.push(`dados da conta: ${motivo(rConta)}`);
    if (rTot.status === 'fulfilled') tot = rTot.value;
    else errosMeta.push(`números do período: ${motivo(rTot)}`);
    if (rSerie.status === 'fulfilled') serie = rSerie.value;
    else errosMeta.push(`números por dia: ${motivo(rSerie)}`);
    if (rLista.status === 'fulfilled') lista = rLista.value;
    else errosMeta.push(`lista de anúncios: ${motivo(rLista)}`);
  }

  // ---------- Melhorias (monitor a cada 3 h; se ainda não rodou, calcula agora) ----------
  let melhorias = integracoes.metaAds() ? await lerMelhorias() : null;
  if (integracoes.metaAds() && !melhorias) {
    await rotinaMelhorias(false).catch(() => 0);
    melhorias = await lerMelhorias();
  }

  // ---------- Análise da IA (guardada; roda a cada 8 h ou no botão) ----------
  const [analiseIA, decisoesIA] = integracoes.kv() ? await Promise.all([lerAnaliseAnuncios(), lerDecisoes().catch(() => ({}))]) : [null, {}];

  // ---------- Diagnóstico: por que não estão comprando ----------
  const [falhas, abandonos] = await Promise.all([falhasNosDias(dias), listarAbandonos(dias.length * 24).catch(() => [])]);
  const ativos = lista.filter((a) => a.status === 'ACTIVE' && a.criadoEm);
  const achados = diagnosticar({
    conta: contaInfo,
    meta: tot,
    anuncios: lista,
    site: funilSite,
    pedidosCriados: doAnuncio.length,
    pedidosPagos: doAnuncio.filter(pago).length,
    pagamentosRecusados: doAnuncio.filter((x) => x.status === 'failed').length,
    falhas,
    carrinhosAbandonados: abandonos.filter((a) => !a.convertido && a.origem === 'meta').length,
    horasDeCampanha: ativos.length ? (agora - Math.min(...ativos.map((a) => a.criadoEm))) / 3_600_000 : 0,
  });

  const gasto = tot?.gasto || 0;
  const roas = gasto > 0 ? faturamentoAnuncio / gasto : null;
  const custoVenda = pagosAnuncio.length ? gasto / pagosAnuncio.length : null;
  const ctr = tot && tot.impressoes ? tot.cliquesLink / tot.impressoes : null;
  const cpc = tot && tot.cliquesLink ? gasto / tot.cliquesLink : null;

  const colunasDe = (campo: 'cliquesLink' | 'gasto') =>
    (chave === 'hoje' ? [] : dias).map((d) => {
      const linha = serie.find((x) => x.dia === d);
      const v = linha ? linha[campo] : 0;
      const [, mes, dia] = d.split('-');
      return { chave: d, rotulo: `${dia}/${mes}`, valor: v, detalhe: `${dia}/${mes}: ${campo === 'gasto' ? brl(v) : `${num(v)} clique(s)`}` };
    });

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl">Anúncios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Meta (Facebook e Instagram) · {PERIODOS[chave]} · atualizado {dataHora(agora)} · os números da Meta se atualizam a cada ~5 min
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoAtualizar segundos={300} />
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
            {(Object.keys(PERIODOS) as ChavePeriodo[]).map((k) => (
              <Link key={k} href={`/painel/anuncios?periodo=${k}`} className={`rounded-md px-3 py-1 ${chave === k ? 'bg-[#0B1B34] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {PERIODOS[k]}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {!integracoes.metaAds() && (
        <Aviso>
          Para ver gasto, exibições e cliques, cadastre na Vercel o <b>META_ADS_TOKEN</b> (token de usuário do sistema com permissão
          &quot;ads_read&quot; na conta de anúncios {config.metaAds.conta}) e faça um Redeploy. Enquanto isso, esta tela já mostra o que acontece
          no site com quem veio do anúncio.
        </Aviso>
      )}
      {errosMeta.length > 0 && (
        <Aviso tipo="erro">
          <p className="font-semibold">Não consegui ler parte dos números da Meta:</p>
          <ul className="mt-1 list-disc pl-5">
            {errosMeta.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {errosMeta.some((e) => /\(#10\)|#2\d\d|permiss/i.test(e)) && (
            <p className="mt-2">
              &quot;Permission&quot; quer dizer que o token não tem acesso a essa parte. Confira: o app &quot;Samba Vest Site&quot; tem o caso de uso de
              anúncios (API de Marketing) com <b>ads_read</b>; o token foi gerado com <b>ads_read</b> e <b>read_insights</b>; e o usuário do sistema
              tem &quot;Ver desempenho&quot; na conta {config.metaAds.conta}.
            </p>
          )}
        </Aviso>
      )}
      {erroSite && <Aviso tipo="erro">Não consegui ler os pedidos do WooCommerce: {erroSite}</Aviso>}

      {integracoes.metaAds() && <AnaliseIA analise={analiseIA} decisoes={decisoesIA} disponivel={iaAnunciosDisponivel()} erro={sp.erroIA} />}

      {melhorias && (
        <Cartao
          titulo="Melhorias sugeridas para chegar a mais clientes"
          acao={<span className="text-xs text-slate-500">analisado {dataHora(melhorias.em)} · atualiza a cada 3 h</span>}
        >
          {melhorias.lista.length ? (
            <Diagnostico achados={melhorias.lista} />
          ) : (
            <p className="text-sm text-slate-600">Nenhuma melhoria pendente agora. Os anúncios seguem o calendário e os números estão saudáveis.</p>
          )}
          <p className="mt-3 text-xs text-slate-500">✕ corrigir já · ▲ vale ajustar · ● oportunidade. As novas vão para o seu celular (Painel → Alertas).</p>
        </Cartao>
      )}

      {bfTodos && bfAnuncio && (
        <Cartao
          titulo="Página da Black: o que as pessoas fazem"
          acao={<span className="text-xs text-slate-500">{PERIODOS[chave].toLowerCase()} · 1 vez por pessoa por dia</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">O que fizeram</th>
                  <th className="py-2 pr-3 text-right font-semibold">Todos</th>
                  <th className="py-2 text-right font-semibold">Vindos do anúncio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SINAIS_BF.filter((s) => s === 'abriu' || bfTodos[s] > 0 || bfAnuncio[s] > 0).map((s) => {
                  const cel = (v: Record<string, number>) =>
                    s === 'abriu' ? String(v[s]) : `${v[s]}${v.abriu ? ` · ${pct(v[s] / v.abriu)}` : ''}`;
                  return (
                    <tr key={s} className={s === 'saiu5s' ? 'text-red-700' : ''}>
                      <td className="py-2 pr-3">{NOME_SINAL[s]}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{cel(bfTodos)}</td>
                      <td className="py-2 text-right tabular-nums">{cel(bfAnuncio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Muita gente saindo em até 5 s = toque sem querer no anúncio (comum no Story). Ficam, rolam e não tocam em nenhuma camisa = a página não está
            convencendo.
          </p>
        </Cartao>
      )}

      <Cartao titulo="Por que não estão comprando? (diagnóstico)" acao={<span className="text-xs text-slate-500">{PERIODOS[chave].toLowerCase()}</span>}>
        <Diagnostico achados={achados} />
      </Cartao>

      {/* Conta */}
      {contaInfo && (
        <Cartao titulo="Conta de anúncios">
          <ul className="divide-y divide-slate-100">
            <LinhaServico
              nome={contaInfo.nome}
              estado={contaInfo.status === 1 ? 'ok' : 'erro'}
              detalhe={`${STATUS_CONTA[contaInfo.status] || `situação ${contaInfo.status}`}${contaInfo.saldo ? ` · ${contaInfo.saldo}` : ''}${
                contaInfo.limite ? ` · limite de gastos: ${brl(contaInfo.gastoTotal)} de ${brl(contaInfo.limite)}` : ''
              }`}
            />
          </ul>
        </Cartao>
      )}

      {/* Números da Meta */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Gasto" valor={tot ? brl(gasto) : '—'} ajuda={tot ? `${num(tot.alcance)} pessoas alcançadas` : 'precisa do token da Meta'} />
        <Kpi rotulo="Exibições" valor={tot ? num(tot.impressoes) : '—'} ajuda={tot ? `cada pessoa viu ${tot.frequencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× em média` : ''} />
        <Kpi rotulo="Cliques no link" valor={tot ? num(tot.cliquesLink) : '—'} ajuda={ctr !== null ? `CTR ${pct(ctr)} (bom: acima de 1%)` : ''} />
        <Kpi rotulo="Custo por clique" valor={cpc !== null ? brl(cpc) : '—'} ajuda={tot ? `${num(tot.sacola)} adições ao carrinho (Meta)` : ''} />
      </div>

      {/* Resultado no site */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Pedidos pagos do anúncio" valor={String(pagosAnuncio.length)} ajuda={`${doAnuncio.length - pagosAnuncio.length} pedido(s) ainda sem pagamento`} />
        <Kpi rotulo="Faturamento do anúncio" valor={brl(faturamentoAnuncio)} ajuda="pedidos pagos vindos do anúncio" />
        <Kpi
          rotulo="Retorno (ROAS)"
          valor={roas !== null ? `${roas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×` : '—'}
          ajuda={roas !== null ? `cada R$ 1 gasto voltou ${brl(roas)}` : 'aparece quando houver gasto'}
        />
        <Kpi rotulo="Custo por venda" valor={custoVenda !== null ? brl(custoVenda) : '—'} ajuda="gasto ÷ pedidos pagos do anúncio" />
      </div>

      {/* Funil */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Funil do anúncio: do clique à venda">
          <Funil
            etapas={[
              { nome: 'Clicaram no anúncio (Meta)', valor: tot?.cliquesLink || 0 },
              { nome: 'Chegaram no site', valor: funilSite?.visita || 0 },
              { nome: 'Abriram uma camisa', valor: funilSite?.produto || 0 },
              { nome: 'Colocaram na sacola', valor: funilSite?.sacola || 0 },
              { nome: 'Chegaram no checkout', valor: funilSite?.checkout || 0 },
              { nome: 'Pagaram', valor: pagosAnuncio.length },
            ]}
          />
          <p className="mt-3 text-xs text-slate-400">
            &quot;Chegaram no site&quot; em diante é medido pelo próprio site (link com utm_source=meta ou clique da Meta), 1 por pessoa por dia.
            Começou a contar nesta atualização.
          </p>
        </Cartao>
        <Cartao titulo="Pedidos que vieram do anúncio">
          {doAnuncio.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum pedido do anúncio neste período ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {doAnuncio.slice(0, 12).map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/painel/pedidos/${x.id}`} className="font-semibold text-sky-800 underline">
                      #{x.id}
                    </Link>{' '}
                    {x.cliente.nome} · {x.cliente.uf}
                    <span className="block text-xs text-slate-500">
                      {dataHora(x.criado)}
                      {x.origem?.content ? ` · anúncio: ${x.origem.content}` : x.origem?.campaign ? ` · ${x.origem.campaign}` : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <b className="tabular-nums">{brl(x.total)}</b>
                    <span className={`block text-xs ${pago(x) ? 'text-emerald-700' : 'text-amber-800'}`}>{pago(x) ? 'pago' : 'aguardando pagamento'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {/* Gráficos (um por medida: nunca dois eixos no mesmo gráfico) */}
      {integracoes.metaAds() && chave !== 'hoje' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Cliques no link por dia">
            <Colunas colunas={colunasDe('cliquesLink')} rotulo="Cliques no link por dia" />
          </Cartao>
          <Cartao titulo="Gasto por dia">
            <Colunas colunas={colunasDe('gasto')} rotulo="Gasto por dia" />
          </Cartao>
        </div>
      )}

      {/* Por anúncio */}
      {integracoes.metaAds() && (
        <Cartao titulo="Cada anúncio" acao={<span className="text-xs text-slate-500">os 10 mais recentes</span>}>
          {lista.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum anúncio encontrado na conta.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Anúncio</th>
                    <th className="py-2 pr-3">Situação</th>
                    <th className="py-2 pr-3 text-right">Gasto</th>
                    <th className="py-2 pr-3 text-right">Exibições</th>
                    <th className="py-2 pr-3 text-right">Cliques</th>
                    <th className="py-2 pr-3 text-right">CTR</th>
                    <th className="py-2 pr-3 text-right">Custo/clique</th>
                    <th className="py-2 text-right">Sacola</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, 10).map((a) => {
                    const st =
                      a.chave === 'PAUSED' && !a.status.includes('PAUSED')
                        ? { rotulo: 'Desligado (análise pendente)', tom: 'off' as const }
                        : NOME_STATUS[a.status] || { rotulo: a.status, tom: 'off' as const };
                    const cor = { ok: 'bg-emerald-50 text-emerald-800', atencao: 'bg-amber-50 text-amber-900', erro: 'bg-red-50 text-red-800', off: 'bg-slate-100 text-slate-600' }[st.tom];
                    const icone = { ok: '●', atencao: '▲', erro: '✕', off: '○' }[st.tom];
                    return (
                      <tr key={a.id} className="border-b border-slate-100 align-top">
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2">
                            {a.miniatura && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.miniatura} alt="" width={36} height={36} className="h-9 w-9 rounded object-cover" />
                            )}
                            <span>
                              <b>{a.nome}</b>
                              <span className="block text-xs text-slate-500">{a.campanha}</span>
                            </span>
                          </span>
                          {a.motivoReprovacao && <span className="mt-1 block text-xs text-red-700">Motivo: {a.motivoReprovacao}</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`}>
                            <span aria-hidden>{icone}</span>
                            {st.rotulo}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{brl(a.gasto)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{num(a.impressoes)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{num(a.cliquesLink)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{a.impressoes ? pct(a.cliquesLink / a.impressoes) : '—'}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{a.cliquesLink ? brl(a.gasto / a.cliquesLink) : '—'}</td>
                        <td className="py-2.5 text-right tabular-nums">{num(a.sacola)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      )}

      <Cartao titulo="Como ler">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>
            <b>CTR</b> (cliques ÷ exibições): acima de 1% é bom; abaixo de 0,5% a arte ou o texto não está chamando atenção.
          </li>
          <li>
            <b>Retorno (ROAS)</b>: acima de 3× o anúncio se paga com folga; abaixo de 1× está gastando mais do que vende.
          </li>
          <li>
            Nos <b>3 primeiros dias</b> a Meta está aprendendo: não mexa na campanha por causa de números baixos.
          </li>
          <li>Muitos cliques e pouca sacola: o problema está na página/preço. Muita sacola e pouca venda: no checkout ou no frete.</li>
        </ul>
      </Cartao>
    </div>
  );
}
