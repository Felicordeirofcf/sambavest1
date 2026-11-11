import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Conversa } from '../../../../components/painel/conversa';
import { Aviso, Cartao, Kpi, MarcasPedido, SeloSegmento, StatusPedido, brl, dataCurta, dataHora } from '../../../../components/painel/ui';
import { integracoes } from '../../../../lib/automacao/config';
import { obterConversa } from '../../../../lib/automacao/conversas';
import { exigirLogin } from '../../../../lib/painel/auth';
import { pedidosRecentes } from '../../../../lib/painel/dados';
import { clientes, nomeBase, pago } from '../../../../lib/painel/metricas';

export default async function Cliente({
  params,
  searchParams,
}: {
  params: Promise<{ chave: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  await exigirLogin();
  const chave = decodeURIComponent((await params).chave);
  const { ok, erro } = await searchParams;
  const c = clientes(await pedidosRecentes(365)).find((x) => x.chave === chave);
  if (!c) notFound();

  const conversa = c.whatsapp && integracoes.kv() ? await obterConversa(c.whatsapp).catch(() => null) : null;
  const favoritos = new Map<string, number>();
  for (const p of c.pedidos.filter(pago)) for (const i of p.itens) favoritos.set(nomeBase(i.nome), (favoritos.get(nomeBase(i.nome)) || 0) + i.qtd);
  const pendentes = c.pedidos.filter((p) => p.status === 'pending');

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/painel/clientes" className="text-sm text-slate-500 underline">← Clientes</Link>
        <h1 className="text-2xl font-semibold">{c.nome}</h1>
        <SeloSegmento s={c.segmento} />
      </div>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Total gasto (12 meses)" valor={brl(c.gasto)} />
        <Kpi rotulo="Pedidos pagos" valor={String(c.pagos)} ajuda={`${c.pedidos.length} pedidos no total`} />
        <Kpi rotulo="Primeira compra" valor={c.primeiraCompra ? dataCurta(c.primeiraCompra) : '—'} />
        <Kpi rotulo="Última compra" valor={c.ultimaCompra ? dataCurta(c.ultimaCompra) : '—'} />
      </div>

      {pendentes.length > 0 && (
        <Aviso>
          Este cliente tem {pendentes.length} pedido(s) aguardando pagamento ({pendentes.map((p) => `#${p.id}`).join(', ')}). Um contato pelo WhatsApp pode
          fechar a venda.
        </Aviso>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Cartao titulo="Contato">
          <dl className="text-sm space-y-1">
            <dt className="text-slate-500">E-mail</dt>
            <dd className="break-all">{c.email || '—'}</dd>
            <dt className="text-slate-500">Telefone</dt>
            <dd>{c.telefone || '—'}</dd>
            <dt className="text-slate-500">CPF/CNPJ</dt>
            <dd>{c.documento || '—'}</dd>
            <dt className="text-slate-500">Cidade</dt>
            <dd>
              {c.cidade}
              {c.uf && ` / ${c.uf}`}
            </dd>
          </dl>
          <div className="flex gap-3 mt-4 text-sm">
            {c.whatsapp && (
              <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" className="underline text-emerald-700">WhatsApp ↗</a>
            )}
            {c.email && <a href={`mailto:${c.email}`} className="underline">E-mail</a>}
          </div>
          {favoritos.size > 0 && (
            <>
              <h3 className="text-sm font-semibold mt-5 mb-2">O que compra</h3>
              <ul className="text-sm space-y-1">
                {[...favoritos].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nome, q]) => (
                  <li key={nome} className="flex justify-between gap-2">
                    <span className="truncate">{nome}</span>
                    <span className="text-slate-500 shrink-0">{q} pç</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        <Cartao titulo="Pedidos" className="lg:col-span-2">
          <ul className="divide-y divide-slate-100">
            {c.pedidos.map((p) => (
              <li key={p.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link href={`/painel/pedidos/${p.id}`} className="font-medium underline text-sky-800">#{p.id}</Link>
                <span className="text-slate-500">{dataHora(p.criado)}</span>
                <StatusPedido status={p.status} />
                <span className="ml-auto tabular-nums">{brl(p.total)}</span>
                <span className="w-full text-xs text-slate-500 truncate">{p.itens.map((i) => `${i.qtd}× ${i.nome}`).join(' · ')}</span>
                <span className="w-full">
                  <MarcasPedido p={p} />
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      <Cartao titulo="Conversa no WhatsApp">
        {!c.whatsapp ? (
          <p className="text-sm text-slate-400">Sem telefone válido.</p>
        ) : conversa ? (
          <Conversa conversa={conversa} voltar={`/painel/clientes/${encodeURIComponent(c.chave)}`} />
        ) : (
          <p className="text-sm text-slate-500">
            Nenhuma conversa registrada nos últimos 30 dias.{' '}
            <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" className="underline text-emerald-700">Chamar no WhatsApp ↗</a>
          </p>
        )}
      </Cartao>
    </div>
  );
}
