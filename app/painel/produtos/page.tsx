import { Aviso, Kpi, SeletorPeriodo, brl } from '../../../components/painel/ui';
import { config, integracoes } from '../../../lib/automacao/config';
import { exigirLogin } from '../../../lib/painel/auth';
import { estoque, pedidosRecentes } from '../../../lib/painel/dados';
import { norm, vendasPorVariacao } from '../../../lib/painel/metricas';

export default async function Produtos({ searchParams }: { searchParams: Promise<{ dias?: string; filtro?: string; q?: string }> }) {
  await exigirLogin();
  const sp = await searchParams;
  const dias = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const filtro = sp.filtro || 'todos';
  const q = norm((sp.q || '').trim());

  let erro = '';
  let linhas: Awaited<ReturnType<typeof estoque>> = [];
  let vendas = new Map<number, number>();
  try {
    [linhas, vendas] = await Promise.all([estoque(), pedidosRecentes(dias).then(vendasPorVariacao)]);
  } catch (e) {
    erro = (e as Error).message;
  }

  const comVenda = linhas.map((l) => {
    const vendidas = vendas.get(l.variacaoId || l.produtoId) || 0;
    const porDia = vendidas / dias;
    const cobertura = l.gerencia && l.quantidade !== null && porDia > 0 ? Math.floor(l.quantidade / porDia) : null;
    return { ...l, vendidas, cobertura };
  });
  const semSku = comVenda.filter((l) => !l.sku);
  const skus = new Map<string, number>();
  for (const l of comVenda) if (l.sku) skus.set(l.sku, (skus.get(l.sku) || 0) + 1);
  const duplicados = comVenda.filter((l) => l.sku && (skus.get(l.sku) || 0) > 1);
  const esgotados = comVenda.filter((l) => l.situacao === 'outofstock');
  const baixos = comVenda.filter((l) => l.gerencia && l.quantidade !== null && l.quantidade > 0 && (l.quantidade <= 3 || (l.cobertura !== null && l.cobertura < 14)));

  let mostrar = comVenda;
  if (filtro === 'esgotados') mostrar = esgotados;
  if (filtro === 'baixo') mostrar = baixos;
  if (filtro === 'vendidos') mostrar = comVenda.filter((l) => l.vendidas > 0).sort((a, b) => b.vendidas - a.vendidas);
  if (filtro === 'sem-sku') mostrar = [...semSku, ...duplicados];
  if (q) mostrar = mostrar.filter((l) => norm(l.produto).includes(q) || norm(l.variacao).includes(q) || norm(l.sku).includes(q));

  const filtros = [
    ['todos', `Todos (${comVenda.length})`],
    ['vendidos', 'Mais vendidos'],
    ['baixo', `Estoque baixo (${baixos.length})`],
    ['esgotados', `Esgotados (${esgotados.length})`],
    ['sem-sku', `SKU faltando/duplicado (${semSku.length + duplicados.length})`],
  ];

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Produtos e estoque</h1>
        <SeletorPeriodo atual={dias} base="/painel/produtos" extra={`&filtro=${filtro}`} />
      </div>
      {erro && <Aviso tipo="erro">Não consegui ler os produtos: {erro}</Aviso>}
      {!config.bling.sincronizarEstoque && (
        <Aviso>
          O estoque mostrado é o do WooCommerce. A sincronização Bling → WooCommerce está desligada (BLING_SINCRONIZAR_ESTOQUE).
          {!integracoes.bling() && ' O Bling não está configurado.'}
        </Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Variações à venda" valor={String(comVenda.length - esgotados.length)} ajuda={`${comVenda.length} cadastradas`} />
        <Kpi rotulo={`Peças vendidas (${dias} dias)`} valor={String(comVenda.reduce((s, l) => s + l.vendidas, 0))} />
        <Kpi rotulo="Estoque baixo" valor={String(baixos.length)} ajuda="≤ 3 peças ou < 14 dias de venda" />
        <Kpi rotulo="SKU faltando ou repetido" valor={String(semSku.length + duplicados.length)} ajuda="o Bling liga pelo SKU" />
      </div>

      <form className="flex flex-wrap gap-2 items-center">
        <input type="hidden" name="dias" value={dias} />
        {filtros.map(([v, r]) => (
          <button key={v} name="filtro" value={v} className={`px-3 py-1 rounded-full border text-sm ${filtro === v ? 'bg-[#0B1B34] text-white border-[#0B1B34]' : 'bg-white border-slate-200'}`}>
            {r}
          </button>
        ))}
        <input name="q" defaultValue={sp.q || ''} placeholder="Buscar produto ou SKU" className="ml-auto border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium text-right">Preço</th>
              <th className="px-3 py-2 font-medium text-right">Estoque</th>
              <th className="px-3 py-2 font-medium text-right">Vendidas ({dias}d)</th>
              <th className="px-3 py-2 font-medium text-right">Dura ~</th>
            </tr>
          </thead>
          <tbody>
            {mostrar.slice(0, 400).map((l) => (
              <tr key={`${l.produtoId}-${l.variacaoId}`} className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div>{l.produto}</div>
                  <div className="text-xs text-slate-500">{l.variacao}</div>
                </td>
                <td className={`px-3 py-2 ${!l.sku || (skus.get(l.sku) || 0) > 1 ? 'text-red-700' : 'text-slate-600'}`}>
                  {l.sku || 'sem SKU'}
                  {l.sku && (skus.get(l.sku) || 0) > 1 && ' (repetido)'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(l.preco)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.situacao === 'outofstock' ? (
                    <span className="text-red-700">esgotado</span>
                  ) : l.gerencia ? (
                    l.quantidade
                  ) : (
                    <span className="text-slate-400">sob encomenda</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{l.vendidas || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.cobertura !== null ? `${l.cobertura} dias` : '—'}</td>
              </tr>
            ))}
            {mostrar.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nada aqui.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
