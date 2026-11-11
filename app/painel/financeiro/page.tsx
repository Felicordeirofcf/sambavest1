import { Aviso, Barras, Cartao, Kpi, brl, dataHora } from '../../../components/painel/ui';
import { integracoes } from '../../../lib/automacao/config';
import { exigirLogin } from '../../../lib/painel/auth';
import { ABERTA, carregarFinanceiro, Conta, emAberto, Financeiro, projecaoSemanal, SITUACAO } from '../../../lib/painel/financeiro';
import { diaLocal } from '../../../lib/painel/metricas';
import { atualizarFinanceiro } from '../actions';

export const maxDuration = 60;

const agoraMs = () => Date.now();
const dataBr = (d: string) => (d ? d.split('-').reverse().join('/') : '—');

function explicarErro(msg: string): string {
  if (/40[13]|scope|escopo|permiss|insufficient/i.test(msg)) {
    return 'O aplicativo do Bling não tem permissão para o financeiro. No Bling, abra Central de Extensões → Área do Integrador → seu aplicativo, marque os escopos "Contas a Receber", "Contas a Pagar" e "Categorias Financeiras", salve e autorize o aplicativo de novo pelo link de convite.';
  }
  if (/não autorizado/i.test(msg)) return msg;
  return `Não consegui ler o financeiro do Bling: ${msg}`;
}

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ ver?: string; erro?: string }> }) {
  await exigirLogin();
  const { ver, erro: erroAtualizar } = await searchParams;

  if (!integracoes.bling()) {
    return (
      <div className="space-y-4 max-w-4xl">
        <h1 className="text-2xl font-semibold">Financeiro</h1>
        <Aviso tipo="erro">O Bling não está configurado (BLING_CLIENT_ID / BLING_CLIENT_SECRET).</Aviso>
      </div>
    );
  }

  let f: Financeiro | null = null;
  let erro = erroAtualizar ? explicarErro(erroAtualizar) : '';
  try {
    f = await carregarFinanceiro();
  } catch (e) {
    erro = explicarErro((e as Error).message);
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-slate-500">
            Contas a receber e a pagar do Bling{f ? ` · atualizado ${dataHora(f.atualizadoEm)}` : ''}
          </p>
        </div>
        <form action={atualizarFinanceiro}>
          <button className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Atualizar do Bling</button>
        </form>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {f && <Conteudo f={f} ver={ver} />}
    </div>
  );
}

function Conteudo({ f, ver }: { f: Financeiro; ver?: string }) {
  const agora = agoraMs();
  const hoje = diaLocal(agora);
  const em30 = diaLocal(agora + 30 * 86_400_000);
  const abertasR = f.receber.filter((c) => ABERTA.includes(c.situacao));
  const abertasP = f.pagar.filter((c) => ABERTA.includes(c.situacao));
  const soma = (l: Conta[]) => l.reduce((s, c) => s + emAberto(c), 0);
  const vencR = abertasR.filter((c) => c.vencimento < hoje);
  const vencP = abertasP.filter((c) => c.vencimento < hoje);
  const r30 = soma(abertasR.filter((c) => c.vencimento >= hoje && c.vencimento <= em30));
  const p30 = soma(abertasP.filter((c) => c.vencimento >= hoje && c.vencimento <= em30));
  const proj = projecaoSemanal(f, 8, agora);
  const saldoVencidas = proj.vencidas.entradas - proj.vencidas.saidas;
  const linhas = proj.semanas.reduce<{ s: (typeof proj.semanas)[number]; saldo: number; acumulado: number }[]>((acc, s) => {
    const saldo = s.entradas - s.saidas;
    const anterior = acc.length ? acc[acc.length - 1].acumulado : saldoVencidas;
    return [...acc, { s, saldo, acumulado: anterior + saldo }];
  }, []);

  // Despesas do mês por categoria (contas com detalhe carregado)
  const doMes = f.pagar.filter((c) => c.situacao !== 5 && c.vencimento >= f.inicioMes && c.vencimento.slice(0, 7) === hoje.slice(0, 7));
  const porCategoria = new Map<string, { valor: number; qtd: number }>();
  const semDetalhe = doMes.filter((c) => !c.detalhado);
  for (const c of doMes.filter((x) => x.detalhado)) {
    const k = c.categoria || 'Sem categoria';
    const atual = porCategoria.get(k) || { valor: 0, qtd: 0 };
    porCategoria.set(k, { valor: atual.valor + c.valor, qtd: atual.qtd + 1 });
  }
  const categorias = [...porCategoria].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor).slice(0, 8);

  const listaPagar = (ver === 'todas-pagar' ? abertasP : abertasP.filter((c) => c.vencimento <= em30)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const listaReceber = (ver === 'todas-receber' ? abertasR : abertasR.filter((c) => c.vencimento <= em30)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return (
    <>
      {f.avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="A receber (próximos 30 dias)" valor={brl(r30)} ajuda={`${brl(soma(abertasR))} em aberto no total`} />
        <Kpi rotulo="A pagar (próximos 30 dias)" valor={brl(p30)} ajuda={`${brl(soma(abertasP))} em aberto no total`} />
        <Kpi rotulo="Saldo previsto em 30 dias" valor={brl(r30 - p30)} ajuda="a receber − a pagar, sem os vencidos" />
        <Kpi rotulo="Realizado no mês" valor={brl(f.recebidoNoMes - f.pagoNoMes)} ajuda={`recebido ${brl(f.recebidoNoMes)} · pago ${brl(f.pagoNoMes)}`} />
      </div>

      {(vencR.length > 0 || vencP.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          {vencP.length > 0 && (
            <Aviso tipo="erro">
              <b>{vencP.length} conta(s) a pagar vencida(s)</b>, somando {brl(soma(vencP))}. Pague ou dê baixa no Bling para evitar juros.
            </Aviso>
          )}
          {vencR.length > 0 && (
            <Aviso>
              <b>{vencR.length} conta(s) a receber vencida(s)</b>, somando {brl(soma(vencR))}. Confira se já foram recebidas e dê baixa no Bling, ou cobre o cliente.
            </Aviso>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Cartao titulo="Fluxo de caixa previsto (contas em aberto)" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 font-medium">Semana</th>
                  <th className="py-2 font-medium text-right">Entradas</th>
                  <th className="py-2 font-medium text-right">Saídas</th>
                  <th className="py-2 font-medium text-right">Saldo da semana</th>
                  <th className="py-2 font-medium text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-2">Vencidas (em aberto)</td>
                  <td className="py-2 text-right tabular-nums">{brl(proj.vencidas.entradas)}</td>
                  <td className="py-2 text-right tabular-nums">{brl(proj.vencidas.saidas)}</td>
                  <td className="py-2 text-right tabular-nums">{brl(proj.vencidas.entradas - proj.vencidas.saidas)}</td>
                  <td className="py-2 text-right tabular-nums">{brl(saldoVencidas)}</td>
                </tr>
                {linhas.map(({ s, saldo, acumulado }) => {
                  return (
                    <tr key={s.inicio} className="border-b border-slate-100">
                      <td className="py-2">
                        {dataBr(s.inicio).slice(0, 5)} a {dataBr(s.fim).slice(0, 5)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{brl(s.entradas)}</td>
                      <td className="py-2 text-right tabular-nums">{brl(s.saidas)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {saldo < 0 && <span aria-hidden className="mr-1">▼</span>}
                        {brl(saldo)}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${acumulado < 0 ? 'font-semibold' : ''}`}>{brl(acumulado)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Considera só o que está lançado no Bling. Vendas do site entram aqui quando o pedido de venda gera conta a receber no Bling.
          </p>
        </Cartao>

        <Cartao titulo="Despesas do mês por categoria">
          <Barras fatias={categorias} />
          {semDetalhe.length > 0 && (
            <p className="text-xs text-slate-500 mt-3">
              {semDetalhe.length} conta(s) do mês ({brl(semDetalhe.reduce((s, c) => s + c.valor, 0))}) ficaram de fora porque o detalhe não foi carregado.
            </p>
          )}
        </Cartao>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Cartao
          titulo={`Contas a pagar em aberto ${ver === 'todas-pagar' ? '(todas)' : '(até 30 dias)'}`}
          acao={
            <a href={ver === 'todas-pagar' ? '/painel/financeiro' : '/painel/financeiro?ver=todas-pagar'} className="text-xs underline text-slate-600">
              {ver === 'todas-pagar' ? 'ver só 30 dias' : 'ver todas'}
            </a>
          }
        >
          <ListaContas contas={listaPagar} hoje={hoje} />
        </Cartao>
        <Cartao
          titulo={`Contas a receber em aberto ${ver === 'todas-receber' ? '(todas)' : '(até 30 dias)'}`}
          acao={
            <a href={ver === 'todas-receber' ? '/painel/financeiro' : '/painel/financeiro?ver=todas-receber'} className="text-xs underline text-slate-600">
              {ver === 'todas-receber' ? 'ver só 30 dias' : 'ver todas'}
            </a>
          }
        >
          <ListaContas contas={listaReceber} hoje={hoje} />
        </Cartao>
      </div>

      <p className="text-xs text-slate-500">
        O painel só lê o financeiro. Para dar baixa, editar ou lançar contas, use o Bling (Finanças → Contas a pagar / Contas a receber).
      </p>
    </>
  );
}

function ListaContas({ contas, hoje }: { contas: Conta[]; hoje: string }) {
  if (contas.length === 0) return <p className="text-sm text-slate-400">Nada em aberto.</p>;
  return (
    <ul className="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
      {contas.map((c) => {
        const vencida = c.vencimento < hoje;
        return (
          <li key={`${c.tipo}-${c.id}`} className="py-2 text-sm flex gap-3 items-start">
            <div className="w-20 shrink-0">
              <div className={vencida ? 'font-semibold' : ''}>{dataBr(c.vencimento)}</div>
              {vencida && <div className="text-[11px] text-red-700">vencida</div>}
              {c.vencimento === hoje && <div className="text-[11px] text-amber-800">vence hoje</div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">{c.contato || (c.contatoId ? `Contato ${c.contatoId}` : '—')}</div>
              <div className="text-xs text-slate-500 truncate">
                {[c.historico, c.categoria, c.origem, c.documento && `doc. ${c.documento}`, c.situacao === 3 ? SITUACAO[3] : ''].filter(Boolean).join(' · ') || ' '}
              </div>
              {(c.linkPix || c.linkBoleto) && (
                <div className="text-xs flex gap-3 mt-0.5">
                  {c.linkPix && (
                    <a href={c.linkPix} target="_blank" rel="noreferrer" className="underline">Pix</a>
                  )}
                  {c.linkBoleto && (
                    <a href={c.linkBoleto} target="_blank" rel="noreferrer" className="underline">Boleto</a>
                  )}
                </div>
              )}
            </div>
            <div className="tabular-nums text-right shrink-0">{brl(emAberto(c))}</div>
          </li>
        );
      })}
    </ul>
  );
}
