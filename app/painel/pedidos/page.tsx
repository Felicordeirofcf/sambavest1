import Link from 'next/link';
import { Aviso, MarcasPedido, StatusPedido, brl, dataHora } from '../../../components/painel/ui';
import { exigirLogin } from '../../../lib/painel/auth';
import { pedidosRecentes, STATUS_NOME } from '../../../lib/painel/dados';
import { norm } from '../../../lib/painel/metricas';

const FILTROS = ['todos', 'pending', 'processing', 'completed', 'on-hold', 'cancelled', 'failed', 'refunded'];
const POR_PAGINA = 50;

export default async function Pedidos({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; dias?: string; pagina?: string; so?: string }>;
}) {
  await exigirLogin();
  const sp = await searchParams;
  const status = FILTROS.includes(sp.status || '') ? sp.status! : 'todos';
  const dias = [7, 30, 90, 180, 365].includes(Number(sp.dias)) ? Number(sp.dias) : 90;
  const q = norm((sp.q || '').trim());
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  let erro = '';
  let lista: Awaited<ReturnType<typeof pedidosRecentes>> = [];
  try {
    lista = await pedidosRecentes(dias);
  } catch (e) {
    erro = (e as Error).message;
  }

  const digitos = q.replace(/\D/g, '');
  const filtrados = lista.filter((p) => {
    if (status !== 'todos' && p.status !== status) return false;
    if (sp.so === 'sem-rastreio' && (p.status !== 'processing' || p.marcas.rastreio)) return false;
    if (sp.so === 'erro' && !p.marcas.erro) return false;
    if (!q) return true;
    return (
      String(p.id) === q.replace('#', '') ||
      norm(p.cliente.nome).includes(q) ||
      p.cliente.email.includes(q) ||
      (digitos.length >= 4 && (p.cliente.documento.includes(digitos) || p.cliente.telefone.replace(/\D/g, '').includes(digitos))) ||
      p.itens.some((i) => norm(i.nome).includes(q) || norm(i.sku) === q)
    );
  });
  const total = filtrados.length;
  const pag = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const soma = filtrados.filter((p) => ['processing', 'completed'].includes(p.status)).reduce((s, p) => s + p.total, 0);
  const link = (extra: Record<string, string | number>) => {
    const u = new URLSearchParams({ status, dias: String(dias), ...(q ? { q } : {}), ...(sp.so ? { so: sp.so } : {}) });
    for (const [k, v] of Object.entries(extra)) u.set(k, String(v));
    return `/painel/pedidos?${u}`;
  };

  return (
    <div className="space-y-4 max-w-7xl">
      <h1 className="text-2xl font-semibold">Pedidos</h1>

      <form className="flex flex-wrap gap-2 items-center bg-white border border-slate-200 rounded-xl p-3">
        <input name="q" defaultValue={sp.q || ''} placeholder="Nº, nome, e-mail, CPF, telefone ou produto" className="flex-1 min-w-56 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select name="status" defaultValue={status} className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
          {FILTROS.map((f) => (
            <option key={f} value={f}>
              {f === 'todos' ? 'Todos os status' : STATUS_NOME[f]}
            </option>
          ))}
        </select>
        <select name="dias" defaultValue={String(dias)} className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
          {[7, 30, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              Últimos {d} dias
            </option>
          ))}
        </select>
        <select name="so" defaultValue={sp.so || ''} className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
          <option value="">Sem filtro extra</option>
          <option value="sem-rastreio">Pagos sem rastreio</option>
          <option value="erro">Com erro na automação</option>
        </select>
        <button className="bg-[#0B1B34] text-white rounded-lg px-4 py-2 text-sm">Filtrar</button>
      </form>

      {erro && <Aviso tipo="erro">Não consegui ler os pedidos: {erro}</Aviso>}

      <p className="text-sm text-slate-500">
        {total} pedido(s) · pagos somam {brl(soma)}
      </p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 font-medium">Pedido</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Pagamento</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium">Automações</th>
            </tr>
          </thead>
          <tbody>
            {pag.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                <td className="px-3 py-2">
                  <Link href={`/painel/pedidos/${p.id}`} className="font-medium text-sky-800 underline">
                    #{p.id}
                  </Link>
                  <div className="text-xs text-slate-500">{dataHora(p.criado)}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{p.cliente.nome}</div>
                  <div className="text-xs text-slate-500">
                    {p.cliente.cidade}
                    {p.cliente.uf && ` / ${p.cliente.uf}`}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <StatusPedido status={p.status} />
                </td>
                <td className="px-3 py-2 text-slate-600">{p.metodo.includes('pix') ? 'Pix' : p.metodoNome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(p.total)}</td>
                <td className="px-3 py-2">
                  <MarcasPedido p={p} />
                </td>
              </tr>
            ))}
            {pag.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  Nenhum pedido encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > POR_PAGINA && (
        <div className="flex gap-3 text-sm">
          {pagina > 1 && <Link href={link({ pagina: pagina - 1 })} className="underline">← Anteriores</Link>}
          <span className="text-slate-500">Página {pagina} de {Math.ceil(total / POR_PAGINA)}</span>
          {pagina * POR_PAGINA < total && <Link href={link({ pagina: pagina + 1 })} className="underline">Próximos →</Link>}
        </div>
      )}
    </div>
  );
}
