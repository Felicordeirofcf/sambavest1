import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Aviso, Cartao, Chip, StatusPedido, brl, dataHora } from '../../../../components/painel/ui';
import { obterConversa } from '../../../../lib/automacao/conversas';
import { integracoes } from '../../../../lib/automacao/config';
import { linkRastreio } from '../../../../lib/automacao/melhorenvio';
import { enderecoEntrega, linkPagamento, obterPedido, wc, WcPedido } from '../../../../lib/automacao/woocommerce';
import { telefoneWhatsapp } from '../../../../lib/automacao/whatsapp';
import { linkWhats, mensagensDoPedido } from '../../../../lib/painel/mensagensWhats';
import { exigirLogin } from '../../../../lib/painel/auth';
import { resumir } from '../../../../lib/painel/dados';
import { chaveCliente } from '../../../../lib/painel/metricas';
import { Conversa } from '../../../../components/painel/conversa';
import { anotar, informarRastreio, mudarStatus, reprocessar } from '../../actions';

type Nota = { id: number; note: string; customer_note: boolean; date_created_gmt: string; author: string };

export default async function Pedido({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  await exigirLogin();
  const { id } = await params;
  const { ok, erro } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();

  let bruto: WcPedido;
  try {
    bruto = await obterPedido(id);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes(' 404 ')) notFound();
    return <Aviso tipo="erro">Não consegui ler o pedido: {msg}</Aviso>;
  }
  const p = resumir(bruto);
  const end = enderecoEntrega(bruto);
  const notas = await wc<Nota[]>(`/orders/${id}/notes`).catch(() => [] as Nota[]);
  const whats = telefoneWhatsapp(p.cliente.telefone);
  const conversa = whats && integracoes.kv() ? await obterConversa(whats).catch(() => null) : null;
  const pago = p.status === 'processing' || p.status === 'completed';
  const aqui = `/painel/pedidos/${id}`;
  const mensagens = whats
    ? mensagensDoPedido(p, {
        linkPagamento: p.status === 'pending' ? linkPagamento(bruto) : undefined,
        linkRastreio: p.marcas.rastreio ? linkRastreio(p.marcas.rastreio) : undefined,
      })
    : [];
  const principal = mensagens.find((m) => m.destaque);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/painel/pedidos" className="text-sm text-slate-500 underline">← Pedidos</Link>
        <h1 className="text-2xl md:text-3xl">Pedido #{p.id}</h1>
        <StatusPedido status={p.status} />
        <span className="text-sm text-slate-500">{dataHora(p.criado)}</span>
        <a href={`https://api.sambavest.com/wp-admin/post.php?post=${p.id}&action=edit`} target="_blank" rel="noreferrer" className="ml-auto text-sm underline text-slate-600">
          Abrir no WooCommerce ↗
        </a>
      </div>

      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {p.marcas.erro && <Aviso tipo="erro">Último erro da automação: {p.marcas.erro}</Aviso>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Cartao titulo="Itens" className="lg:col-span-2">
          <table className="w-full text-sm">
            <tbody>
              {p.itens.map((i, n) => (
                <tr key={n} className="border-b border-slate-100">
                  <td className="py-2">
                    {i.nome}
                    <div className="text-xs text-slate-500">SKU {i.sku || '—'}</div>
                  </td>
                  <td className="py-2 text-right text-slate-500">{i.qtd}×</td>
                  <td className="py-2 text-right tabular-nums">{brl(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm max-w-xs ml-auto">
            {p.desconto > 0 && (
              <>
                <dt className="text-slate-500">Desconto</dt>
                <dd className="text-right tabular-nums">−{brl(p.desconto)}</dd>
              </>
            )}
            <dt className="text-slate-500">Frete ({p.freteNome || '—'})</dt>
            <dd className="text-right tabular-nums">{brl(p.frete)}</dd>
            <dt className="font-medium">Total</dt>
            <dd className="text-right tabular-nums font-medium">{brl(p.total)}</dd>
          </dl>
          <p className="text-sm text-slate-500 mt-3">
            Pagamento: {p.metodoNome}
            {p.pago ? ` · pago em ${dataHora(p.pago)}` : ''}
            {!pago && p.status === 'pending' && (
              <>
                {' · '}
                <a href={linkPagamento(bruto)} target="_blank" rel="noreferrer" className="underline">
                  link de pagamento
                </a>
              </>
            )}
          </p>
        </Cartao>

        <Cartao titulo="Cliente">
          <p className="font-medium">
            <Link href={`/painel/clientes/${encodeURIComponent(chaveCliente(p))}`} className="underline">
              {p.cliente.nome}
            </Link>
          </p>
          <p className="text-sm text-slate-600 break-all">{p.cliente.email}</p>
          <p className="text-sm text-slate-600">{p.cliente.telefone}</p>
          <p className="text-sm text-slate-600">CPF/CNPJ {p.cliente.documento || '—'}</p>
          <p className="text-sm text-slate-600 mt-3">
            {end.rua}, {end.numero}
            {end.complemento && ` · ${end.complemento}`}
            <br />
            {end.bairro} · {end.cidade}/{end.uf} · CEP {end.cep}
          </p>
          {whats && principal && (
            <a
              href={linkWhats(whats, principal.texto)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-black hover:bg-[#1fbd5a]"
            >
              📲 Avisar no WhatsApp: {principal.rotulo.toLowerCase()}
            </a>
          )}
          {whats && (
            <div className="flex gap-3 mt-3 text-sm">
              <a href={`https://wa.me/${whats}`} target="_blank" rel="noreferrer" className="underline text-emerald-700">
                WhatsApp ↗
              </a>
              {conversa && (
                <Link href={`/atendimento?n=${conversa.numero}`} className="underline">
                  Conversa no atendimento
                </Link>
              )}
            </div>
          )}
        </Cartao>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Cartao titulo="Automações" className="lg:col-span-2">
          {!pago ? (
            <p className="text-sm text-slate-500">As automações rodam quando o pagamento é aprovado.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2 items-center">
                <Chip ok={Boolean(p.marcas.avisoPago)}>Aviso de pagamento</Chip>
                <span className="text-slate-500">{p.marcas.avisoPago || 'não enviado'}</span>
              </li>
              <li className="flex gap-2 items-center">
                <Chip ok={Boolean(p.marcas.bling)}>Bling</Chip>
                <span className="text-slate-500">{p.marcas.bling ? `pedido de venda ${p.marcas.bling}` : 'ainda não criado'}</span>
              </li>
              <li className="flex gap-2 items-center">
                <Chip ok={Boolean(p.marcas.nfe)}>NF-e</Chip>
                <span className="text-slate-500 break-all">{p.marcas.nfeChave ? `chave ${p.marcas.nfeChave}` : p.marcas.nfe ? `nota ${p.marcas.nfe}` : 'sem nota'}</span>
              </li>
              <li className="flex gap-2 items-center">
                <Chip ok={Boolean(p.marcas.envio)}>Melhor Envio</Chip>
                <span className="text-slate-500">
                  {p.marcas.envio ? `envio ${p.marcas.envio}` : 'sem envio'}
                  {p.marcas.etiqueta?.startsWith('http') && (
                    <>
                      {' · '}
                      <a href={p.marcas.etiqueta} target="_blank" rel="noreferrer" className="underline">imprimir etiqueta</a>
                    </>
                  )}
                </span>
              </li>
              <li className="flex gap-2 items-center">
                <Chip ok={Boolean(p.marcas.rastreio)}>Rastreio</Chip>
                <span className="text-slate-500">
                  {p.marcas.rastreio ? (
                    <a href={linkRastreio(p.marcas.rastreio)} target="_blank" rel="noreferrer" className="underline">{p.marcas.rastreio}</a>
                  ) : (
                    'sem código'
                  )}
                </span>
              </li>
              <li className="flex gap-2 items-center">
                <Chip ok={Boolean(p.marcas.avisoEnviado)}>Aviso de envio</Chip>
                <span className="text-slate-500">{p.marcas.avisoEnviado || 'não enviado'}</span>
              </li>
            </ul>
          )}
          <div className="flex flex-wrap gap-3 mt-4">
            <form action={reprocessar}>
              <input type="hidden" name="id" value={p.id} />
              <button className="text-sm px-3 py-2 rounded-lg bg-[#0B1B34] text-white">Rodar automações de novo</button>
            </form>
            {pago && !p.marcas.rastreio && (
              <form action={informarRastreio} className="flex gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="codigo" placeholder="Código de rastreio" required className="border border-slate-300 rounded-lg px-3 py-2 text-sm uppercase" />
                <button className="text-sm px-3 py-2 rounded-lg border border-slate-300">Salvar e avisar cliente</button>
              </form>
            )}
          </div>
        </Cartao>

        <Cartao titulo="Status">
          <form action={mudarStatus} className="space-y-2 text-sm">
            <input type="hidden" name="id" value={p.id} />
            <select name="status" defaultValue={p.status} className="w-full border border-slate-300 rounded-lg px-2 py-2">
              <option value="processing">Pago · a enviar</option>
              <option value="on-hold">Aguardando</option>
              <option value="completed">Concluído</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <label className="flex gap-2 items-center text-slate-600">
              <input type="checkbox" name="confirmar" value="sim" /> confirmo (obrigatório para cancelar)
            </label>
            <button className="w-full px-3 py-2 rounded-lg border border-slate-300">Alterar status</button>
            <p className="text-xs text-slate-500">Cancelar não estorna o pagamento na AppMax: faça o estorno no painel da AppMax.</p>
          </form>
        </Cartao>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Cartao titulo="Notas do pedido">
          <form action={anotar} className="space-y-2 mb-4">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="nota" rows={2} required placeholder="Escreva uma nota" className="w-full border border-slate-300 rounded-lg p-2 text-sm" />
            <div className="flex justify-between items-center">
              <label className="text-sm text-slate-600 flex gap-2 items-center">
                <input type="checkbox" name="cliente" value="sim" /> enviar ao cliente por e-mail
              </label>
              <button className="text-sm px-3 py-2 rounded-lg border border-slate-300">Salvar nota</button>
            </div>
          </form>
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {notas.map((n) => (
              <li key={n.id} className={`text-sm rounded-lg p-3 ${n.customer_note ? 'bg-sky-50' : 'bg-slate-50'}`}>
                <div className="text-xs text-slate-500 mb-1">
                  {dataHora(new Date(n.date_created_gmt + 'Z').getTime())} · {n.author}
                  {n.customer_note && ' · enviada ao cliente'}
                </div>
                <div className="whitespace-pre-wrap break-words">{textoDaNota(n.note)}</div>
              </li>
            ))}
            {notas.length === 0 && <li className="text-sm text-slate-400">Sem notas.</li>}
          </ul>
        </Cartao>

        <Cartao titulo="WhatsApp">
          {!whats ? (
            <p className="text-sm text-slate-400">Pedido sem telefone válido.</p>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mensagens prontas (abre o seu WhatsApp com o texto)</p>
              <ul className="space-y-2">
                {mensagens.map((m) => (
                  <li key={m.id} className={`rounded-xl border p-3 ${m.destaque ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">{m.rotulo}</span>
                      <a
                        href={linkWhats(whats, m.texto)}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#1fbd5a]"
                      >
                        Abrir no WhatsApp ↗
                      </a>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-xs text-slate-600 line-clamp-4">{m.texto}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {conversa ? (
                  <Conversa conversa={conversa} voltar={aqui} />
                ) : (
                  <p className="text-xs text-slate-400">Nenhuma conversa registrada com este cliente nos últimos 30 dias.</p>
                )}
              </div>
            </>
          )}
        </Cartao>
      </div>
    </div>
  );
}

/** Notas do WooCommerce vêm em HTML: mostra só o texto (links viram "texto (endereço)"). */
function textoDaNota(html: string): string {
  return html
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
