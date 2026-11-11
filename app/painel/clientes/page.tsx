import Link from 'next/link';
import { Aviso, Kpi, SeloSegmento, brl, dataCurta } from '../../../components/painel/ui';
import { exigirLogin } from '../../../lib/painel/auth';
import { pedidosRecentes } from '../../../lib/painel/dados';
import { clientes, norm, Segmento, VIP_GASTO } from '../../../lib/painel/metricas';

const SEGMENTOS: Segmento[] = ['VIP', 'Recorrente', 'Novo', 'Inativo', 'Não comprou'];
const POR_PAGINA = 60;

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; seg?: string; ordem?: string; pagina?: string }> }) {
  await exigirLogin();
  const sp = await searchParams;
  const q = norm((sp.q || '').trim());
  const seg = SEGMENTOS.find((s) => s === sp.seg);
  const ordem = sp.ordem === 'gasto' || sp.ordem === 'pedidos' ? sp.ordem : 'recente';
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  let erro = '';
  let base: ReturnType<typeof clientes> = [];
  try {
    base = clientes(await pedidosRecentes(365));
  } catch (e) {
    erro = (e as Error).message;
  }
  const contagem = Object.fromEntries(SEGMENTOS.map((s) => [s, base.filter((c) => c.segmento === s).length]));
  const compradores = base.filter((c) => c.pagos > 0);
  const ltv = compradores.length ? compradores.reduce((s, c) => s + c.gasto, 0) / compradores.length : 0;
  const recompra = compradores.length ? compradores.filter((c) => c.pagos >= 2).length / compradores.length : 0;

  const digitos = q.replace(/\D/g, '');
  let lista = base.filter((c) => {
    if (seg && c.segmento !== seg) return false;
    if (!q) return true;
    return norm(c.nome).includes(q) || c.email.includes(q) || (digitos.length >= 4 && (c.documento.includes(digitos) || c.telefone.replace(/\D/g, '').includes(digitos))) || norm(c.cidade).includes(q);
  });
  if (ordem === 'gasto') lista = [...lista].sort((a, b) => b.gasto - a.gasto);
  if (ordem === 'pedidos') lista = [...lista].sort((a, b) => b.pagos - a.pagos || b.gasto - a.gasto);
  const pag = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const params = (extra: Record<string, string | number>, semSegmento = false) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(seg && !semSegmento ? { seg } : {}), ordem });
    for (const [k, v] of Object.entries(extra)) u.set(k, String(v));
    return `/painel/clientes?${u}`;
  };

  return (
    <div className="space-y-4 max-w-7xl">
      <h1 className="text-2xl font-semibold">Clientes</h1>
      <p className="text-sm text-slate-500">
        Base montada a partir dos pedidos do WooCommerce dos últimos 12 meses (agrupados por CPF, e-mail ou telefone).
      </p>
      {erro && <Aviso tipo="erro">Não consegui ler os pedidos: {erro}</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Clientes que compraram" valor={String(compradores.length)} ajuda={`${base.length} contatos no total`} />
        <Kpi rotulo="Gasto médio por cliente (12 meses)" valor={brl(ltv)} />
        <Kpi rotulo="Taxa de recompra" valor={`${(recompra * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} ajuda="compraram 2+ vezes" />
        <Kpi rotulo="Não concluíram a compra" valor={String(contagem['Não comprou'])} ajuda="Pix/cartão não pago: oportunidade" />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={params({ pagina: 1 }, true)} className={`px-3 py-1 rounded-full border ${!seg ? 'bg-[#0B1B34] text-white border-[#0B1B34]' : 'bg-white border-slate-200'}`}>
          Todos ({base.length})
        </Link>
        {SEGMENTOS.map((s) => (
          <Link key={s} href={params({ seg: s, pagina: 1 })} className={`px-3 py-1 rounded-full border ${seg === s ? 'bg-[#0B1B34] text-white border-[#0B1B34]' : 'bg-white border-slate-200'}`}>
            {s} ({contagem[s]})
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        VIP: gastou {brl(VIP_GASTO)}+ ou comprou 3+ vezes · Recorrente: 2 compras · Novo: 1 compra · Inativo: sem comprar há 4 meses · Não comprou: só pedidos não pagos.
      </p>

      <form className="flex flex-wrap gap-2 bg-white border border-slate-200 rounded-xl p-3">
        {seg && <input type="hidden" name="seg" value={seg} />}
        <input name="q" defaultValue={sp.q || ''} placeholder="Nome, e-mail, CPF, telefone ou cidade" className="flex-1 min-w-56 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select name="ordem" defaultValue={ordem} className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
          <option value="recente">Mais recentes</option>
          <option value="gasto">Maior gasto</option>
          <option value="pedidos">Mais pedidos</option>
        </select>
        <button className="bg-[#0B1B34] text-white rounded-lg px-4 py-2 text-sm">Buscar</button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Segmento</th>
              <th className="px-3 py-2 font-medium text-right">Pedidos pagos</th>
              <th className="px-3 py-2 font-medium text-right">Gasto</th>
              <th className="px-3 py-2 font-medium">Última compra</th>
              <th className="px-3 py-2 font-medium">Contato</th>
            </tr>
          </thead>
          <tbody>
            {pag.map((c) => (
              <tr key={c.chave} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/painel/clientes/${encodeURIComponent(c.chave)}`} className="font-medium text-sky-800 underline">
                    {c.nome}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {c.cidade}
                    {c.uf && ` / ${c.uf}`}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <SeloSegmento s={c.segmento} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.pagos}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(c.gasto)}</td>
                <td className="px-3 py-2 text-slate-600">{c.ultimaCompra ? dataCurta(c.ultimaCompra) : '—'}</td>
                <td className="px-3 py-2">
                  {c.whatsapp ? (
                    <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" className="underline text-emerald-700">
                      WhatsApp ↗
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {pag.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nenhum cliente encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {lista.length > POR_PAGINA && (
        <div className="flex gap-3 text-sm">
          {pagina > 1 && <Link href={params({ pagina: pagina - 1 })} className="underline">← Anteriores</Link>}
          <span className="text-slate-500">Página {pagina} de {Math.ceil(lista.length / POR_PAGINA)}</span>
          {pagina * POR_PAGINA < lista.length && <Link href={params({ pagina: pagina + 1 })} className="underline">Próximos →</Link>}
        </div>
      )}
    </div>
  );
}
