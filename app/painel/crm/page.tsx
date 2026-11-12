import Link from 'next/link';
import { Aviso, Kpi, brl, dataHora } from '../../../components/painel/ui';
import { integracoes } from '../../../lib/automacao/config';
import { exigirLogin } from '../../../lib/painel/auth';
import { ETAPAS, nomeDoContato, nomeEtapa } from '../../../lib/painel/crm';
import { contatosCrm } from '../../../lib/painel/crmDados';
import { norm } from '../../../lib/painel/metricas';

const agoraMs = () => Date.now();
const FILTROS = [
  ['todos', 'Todos'],
  ['nao-lidas', 'Não lidas'],
  ['sem-resposta', 'Esperando resposta'],
  ['leads', 'Ainda não compraram'],
  ['clientes', 'Já compraram'],
  ['pix', 'Com pedido não pago'],
] as const;

const COR_ETAPA: Record<string, string> = {
  novo: 'bg-sky-50 text-sky-800 ring-sky-200',
  atendimento: 'bg-amber-50 text-amber-900 ring-amber-200',
  pagamento: 'bg-orange-50 text-orange-800 ring-orange-200',
  cliente: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  'pos-venda': 'bg-violet-50 text-violet-800 ring-violet-200',
  perdido: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default async function Crm({ searchParams }: { searchParams: Promise<{ f?: string; etapa?: string; q?: string; com?: string }> }) {
  await exigirLogin();
  const sp = await searchParams;
  const f = FILTROS.some(([v]) => v === sp.f) ? sp.f! : 'todos';
  const etapa = ETAPAS.some((e) => e.id === sp.etapa) ? sp.etapa : undefined;
  const q = norm((sp.q || '').trim());
  const soConversas = sp.com !== 'avisos'; // por padrão, só quem mandou mensagem

  if (!integracoes.kv()) {
    return <Aviso tipo="erro">O CRM precisa do Upstash (KV) configurado para guardar os contatos.</Aviso>;
  }

  const { contatos: todos, erroPedidos } = await contatosCrm();
  const agora = agoraMs();
  const base = todos.filter((c) => (soConversas ? c.mensagensCliente > 0 : true));
  const dia = 86_400_000;
  const kpis = {
    total: base.length,
    novos7: base.filter((c) => agora - c.criadoEm < 7 * dia).length,
    naoLidas: base.filter((c) => c.naoLidas > 0).length,
    semResposta: base.filter((c) => c.ultimaDe === 'cliente').length,
    compraram: base.filter((c) => c.pagos > 0).length,
  };

  const digitos = q.replace(/\D/g, '');
  const lista = base.filter((c) => {
    if (etapa && c.etapa !== etapa) return false;
    if (f === 'nao-lidas' && c.naoLidas === 0) return false;
    if (f === 'sem-resposta' && c.ultimaDe !== 'cliente') return false;
    if (f === 'leads' && c.pagos > 0) return false;
    if (f === 'clientes' && c.pagos === 0) return false;
    if (f === 'pix' && c.pendentes === 0) return false;
    if (!q) return true;
    return (
      norm(nomeDoContato(c)).includes(q) ||
      (digitos.length >= 4 && c.numero.includes(digitos)) ||
      c.etiquetas.some((t) => t.includes(q)) ||
      norm(c.ultimaMensagem || '').includes(q)
    );
  });
  const link = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const atual: Record<string, string | undefined> = { f, etapa, q: sp.q, com: sp.com, ...extra };
    for (const [k, v] of Object.entries(atual)) if (v && !(k === 'f' && v === 'todos')) u.set(k, v);
    const s = u.toString();
    return `/painel/crm${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">CRM · WhatsApp</h1>
          <p className="text-sm text-slate-500">Todo contato que conversa com a loja entra aqui sozinho, ligado aos pedidos pelo telefone.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/painel/crm/quadro" className="text-sm px-3 py-1.5 rounded-lg bg-[#0B1B34] text-white hover:bg-[#C9A227] hover:text-[#0B1B34]">
            Quadro (48h)
          </Link>
          <Link href="/atendimento" className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            Abrir atendimento
          </Link>
        </div>
      </div>

      {!integracoes.whatsapp() && (
        <Aviso>O WhatsApp ainda não está conectado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID). Assim que conectar, as conversas passam a aparecer aqui.</Aviso>
      )}
      {erroPedidos && <Aviso tipo="erro">Não consegui ler os pedidos do WooCommerce: {erroPedidos}</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi rotulo="Contatos" valor={String(kpis.total)} ajuda={`${kpis.novos7} novos em 7 dias`} />
        <Kpi rotulo="Não lidas" valor={String(kpis.naoLidas)} />
        <Kpi rotulo="Esperando resposta" valor={String(kpis.semResposta)} ajuda="última mensagem é do cliente" />
        <Kpi rotulo="Já compraram" valor={String(kpis.compraram)} ajuda="pedido pago nos últimos 12 meses" />
        <Kpi rotulo="Conversão" valor={kpis.total ? `${Math.round((kpis.compraram / kpis.total) * 100)}%` : '—'} ajuda="contatos que compraram" />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {FILTROS.map(([v, r]) => (
          <Link key={v} href={link({ f: v })} className={`px-3 py-1 rounded-full border ${f === v ? 'bg-[#0B1B34] text-white border-[#0B1B34]' : 'bg-white border-slate-200'}`}>
            {r}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href={link({ etapa: undefined })} className={`px-2.5 py-1 rounded-full ring-1 ${!etapa ? 'bg-[#0B1B34] text-white ring-[#0B1B34]' : 'bg-white ring-slate-200'}`}>
          Todas as etapas
        </Link>
        {ETAPAS.map((e) => (
          <Link key={e.id} href={link({ etapa: e.id })} className={`px-2.5 py-1 rounded-full ring-1 ${etapa === e.id ? 'bg-[#0B1B34] text-white ring-[#0B1B34]' : COR_ETAPA[e.id]}`}>
            {e.nome} ({base.filter((c) => c.etapa === e.id).length})
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2 bg-white border border-slate-200 rounded-xl p-3 items-center">
        <input type="hidden" name="f" value={f} />
        {etapa && <input type="hidden" name="etapa" value={etapa} />}
        <input name="q" defaultValue={sp.q || ''} placeholder="Nome, telefone, etiqueta ou texto da mensagem" className="flex-1 min-w-56 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <label className="text-sm text-slate-600 flex items-center gap-1.5">
          <input type="checkbox" name="com" value="avisos" defaultChecked={!soConversas} /> incluir quem só recebeu avisos
        </label>
        <button className="bg-[#0B1B34] text-white rounded-lg px-4 py-2 text-sm">Buscar</button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {lista.slice(0, 300).map((c) => (
          <Link key={c.chave} href={`/painel/crm/${c.chave}`} className="flex gap-3 p-3 hover:bg-slate-50 items-start">
            <div className="w-9 h-9 rounded-full bg-[#0B1B34] text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {nomeDoContato(c).replace(/[^\p{L}\d]/gu, '').slice(0, 1).toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium truncate">{nomeDoContato(c)}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ring-1 ${COR_ETAPA[c.etapa] || ''}`}>{nomeEtapa(c.etapa)}</span>
                {c.pagos > 0 ? (
                  <span className="text-[11px] text-emerald-800">✓ {c.pagos} compra(s) · {brl(c.gasto)}</span>
                ) : (
                  <span className="text-[11px] text-slate-500">sem compra</span>
                )}
                {c.pendentes > 0 && <span className="text-[11px] text-orange-800">● pedido não pago</span>}
                {c.etiquetas.map((t) => (
                  <span key={t} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 rounded">
                    #{t}
                  </span>
                ))}
              </div>
              <p className="text-sm text-slate-600 truncate mt-0.5">
                {c.ultimaDe === 'cliente' ? '' : c.ultimaDe === 'aviso' ? 'Aviso: ' : 'Você: '}
                {c.ultimaMensagem || '—'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-slate-500">{dataHora(c.ultimaAtividade)}</div>
              {c.naoLidas > 0 && <span className="inline-block mt-1 bg-emerald-600 text-white text-xs px-2 rounded-full">{c.naoLidas}</span>}
            </div>
          </Link>
        ))}
        {lista.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">
            {todos.length === 0 ? 'Nenhuma conversa ainda. Quando um cliente mandar mensagem para a loja, ele aparece aqui.' : 'Nenhum contato com esses filtros.'}
          </p>
        )}
      </div>
      {lista.length > 300 && <p className="text-xs text-slate-500">Mostrando 300 de {lista.length}. Use a busca para achar os outros.</p>}
    </div>
  );
}
