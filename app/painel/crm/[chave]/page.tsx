import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Conversa } from '../../../../components/painel/conversa';
import { Aviso, Cartao, Kpi, MarcasPedido, StatusPedido, brl, dataCurta, dataHora } from '../../../../components/painel/ui';
import { obterConversa } from '../../../../lib/automacao/conversas';
import { exigirLogin } from '../../../../lib/painel/auth';
import { ETAPAS, nomeDoContato, obterContato } from '../../../../lib/painel/crm';
import { enriquecer, pedidosPorTelefone } from '../../../../lib/painel/crmDados';
import { pedidosRecentes } from '../../../../lib/painel/dados';
import { chaveCliente } from '../../../../lib/painel/metricas';
import { lidaCrm, notaCrm, salvarCrm } from '../../actions';

export default async function ContatoCrmPage({
  params,
  searchParams,
}: {
  params: Promise<{ chave: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  await exigirLogin();
  const chave = (await params).chave.replace(/\D/g, '');
  const { ok, erro } = await searchParams;
  const contato = chave ? await obterContato(chave) : null;
  if (!contato) notFound();

  const [conversa, pedidos] = await Promise.all([
    obterConversa(contato.numero).catch(() => null),
    pedidosRecentes(365).catch(() => []),
  ]);
  const c = enriquecer(contato, pedidosPorTelefone(pedidos));
  const aqui = `/painel/crm/${chave}`;

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/painel/crm" className="text-sm text-slate-500 underline">← CRM</Link>
        <h1 className="text-2xl md:text-3xl">{nomeDoContato(c)}</h1>
        <span className="text-sm text-slate-500">+{c.numero}</span>
        <a href={`https://wa.me/${c.numero}`} target="_blank" rel="noreferrer" className="text-sm underline text-emerald-700">
          Abrir no WhatsApp ↗
        </a>
        {c.naoLidas > 0 && (
          <form action={lidaCrm} className="ml-auto">
            <input type="hidden" name="chave" value={chave} />
            <button className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white">Marcar como lida ({c.naoLidas})</button>
          </form>
        )}
      </div>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Primeiro contato" valor={dataCurta(c.criadoEm)} />
        <Kpi rotulo="Mensagens do cliente" valor={String(c.mensagensCliente)} />
        <Kpi rotulo="Compras (12 meses)" valor={String(c.pagos)} ajuda={c.pagos ? brl(c.gasto) : 'ainda não comprou'} />
        <Kpi rotulo="Pedidos não pagos" valor={String(c.pendentes)} ajuda={c.pendentes ? 'vale um contato' : ''} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Cartao titulo="Conversa" className="lg:col-span-2">
          {conversa ? (
            <Conversa conversa={conversa} voltar={aqui} limite={200} />
          ) : (
            <p className="text-sm text-slate-500">O histórico desta conversa expirou. Os dados do contato continuam guardados.</p>
          )}
        </Cartao>

        <div className="space-y-4">
          <Cartao titulo="Contato">
            <form action={salvarCrm} className="space-y-3 text-sm">
              <input type="hidden" name="chave" value={chave} />
              <label className="block">
                <span className="text-slate-500 text-xs">Nome</span>
                <input name="nome" defaultValue={nomeDoContato(c).startsWith('+') ? '' : nomeDoContato(c)} placeholder={c.nome || 'Nome do cliente'} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-slate-500 text-xs">Etapa</span>
                <select name="etapa" defaultValue={c.etapa} className="w-full border border-slate-300 rounded-lg px-2 py-2">
                  {ETAPAS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-500 text-xs">Etiquetas (separe por vírgula)</span>
                <input name="etiquetas" defaultValue={c.etiquetas.join(', ')} placeholder="ex.: atacado, escola, vip" className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </label>
              <button className="w-full bg-[#0B1B34] text-white rounded-lg py-2">Salvar</button>
            </form>
            {c.pedidosWoo[0] && (
              <p className="text-xs text-slate-500 mt-3">
                Cadastro nos pedidos:{' '}
                <Link href={`/painel/clientes/${encodeURIComponent(chaveCliente(c.pedidosWoo[0]))}`} className="underline">
                  {c.pedidosWoo[0].cliente.nome}
                </Link>
                {c.pedidosWoo[0].cliente.email && ` · ${c.pedidosWoo[0].cliente.email}`}
              </p>
            )}
          </Cartao>

          <Cartao titulo="Notas internas">
            <form action={notaCrm} className="space-y-2 mb-3">
              <input type="hidden" name="chave" value={chave} />
              <textarea name="nota" rows={2} required placeholder="Ex.: quer 20 camisas para a ala, pediu orçamento" className="w-full border border-slate-300 rounded-lg p-2 text-sm" />
              <button className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Salvar nota</button>
            </form>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {c.notas.map((n, i) => (
                <li key={i} className="text-sm bg-slate-50 rounded-lg p-2">
                  <div className="text-[11px] text-slate-500">{dataHora(n.em)}</div>
                  <div className="whitespace-pre-wrap break-words">{n.texto}</div>
                </li>
              ))}
              {c.notas.length === 0 && <li className="text-sm text-slate-400">Sem notas.</li>}
            </ul>
          </Cartao>
        </div>
      </div>

      <Cartao titulo="Pedidos deste telefone (12 meses)">
        {c.pedidosWoo.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum pedido com este telefone.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {c.pedidosWoo.map((p) => (
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
        )}
      </Cartao>
    </div>
  );
}
