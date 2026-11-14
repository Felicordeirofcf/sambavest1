// CRM do WhatsApp em quadro (kanban): uma coluna por etapa do funil. Arrastar muda a etapa;
// clicar no cartão abre a conversa no atendimento.
import Link from 'next/link';
import Quadro, { CartaoQuadro } from '../../../components/painel/quadro';
import { Aviso } from '../../../components/painel/ui';
import { semJanela24h } from '../../../lib/automacao/atendimento';
import { integracoes } from '../../../lib/automacao/config';
import { JANELA_MS } from '../../../lib/automacao/conversas';
import { exigirLogin } from '../../../lib/painel/auth';
import { ETAPAS, nomeDoContato } from '../../../lib/painel/crm';
import { contatosCrm } from '../../../lib/painel/crmDados';
import { norm } from '../../../lib/painel/metricas';

const agoraMs = () => Date.now();
const PERIODOS = [
  ['2', '48 h'],
  ['7', '7 dias'],
  ['30', '30 dias'],
  ['tudo', 'Tudo'],
] as const;

export default async function CrmQuadro({ searchParams }: { searchParams: Promise<{ p?: string; q?: string; com?: string }> }) {
  await exigirLogin();
  const sp = await searchParams;
  const periodo = PERIODOS.some(([v]) => v === sp.p) ? sp.p! : '30';
  const soConversas = sp.com !== 'avisos';
  const q = norm((sp.q || '').trim());

  if (!integracoes.kv()) {
    return <Aviso tipo="erro">O CRM precisa do Upstash (KV) configurado para guardar os contatos.</Aviso>;
  }

  const { contatos, erroPedidos } = await contatosCrm();
  const agora = agoraMs();
  const limite = periodo === 'tudo' ? Infinity : Number(periodo) * 86_400_000;
  const digitos = q.replace(/\D/g, '');
  const cartoes: CartaoQuadro[] = contatos
    .filter((c) => agora - c.ultimaAtividade <= limite)
    .filter((c) => (soConversas ? c.mensagensCliente > 0 : true))
    .filter(
      (c) =>
        !q ||
        norm(nomeDoContato(c)).includes(q) ||
        (digitos.length >= 4 && c.numero.includes(digitos)) ||
        c.etiquetas.some((t) => t.includes(q)) ||
        norm(c.ultimaMensagem || '').includes(q)
    )
    .map((c) => ({
      chave: c.chave,
      numero: c.numero,
      nome: nomeDoContato(c),
      etapa: c.etapa,
      ultimaMensagem: c.ultimaMensagem || '',
      ultimaDe: c.ultimaDe || '',
      ultimaAtividade: c.ultimaAtividade,
      naoLidas: c.naoLidas,
      janelaAberta: semJanela24h() || Boolean(c.ultimaDoCliente && agora - c.ultimaDoCliente < JANELA_MS - 60_000),
      pagos: c.pagos,
      gasto: c.gasto,
      pendentes: c.pendentes,
      etiquetas: c.etiquetas,
    }));
  const esperando = cartoes.filter((c) => c.ultimaDe === 'cliente').length;
  const link = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const atual: Record<string, string | undefined> = { p: periodo === '30' ? undefined : periodo, q: sp.q || undefined, com: sp.com, ...extra };
    for (const [k, v] of Object.entries(atual)) if (v) u.set(k, v);
    const s = u.toString();
    return `/painel/crm${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">CRM · WhatsApp</h1>
          <p className="text-sm text-slate-500">
            {cartoes.length} contato(s){esperando > 0 && <b className="text-rose-700"> · {esperando} esperando resposta</b>}. Clique no cartão para abrir a
            conversa; arraste (ou use a seta no celular) para mudar a etapa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {PERIODOS.map(([v, r]) => (
              <Link
                key={v}
                href={link({ p: v === '30' ? undefined : v })}
                className={`rounded-md px-3 py-1 ${v === periodo ? 'bg-[#0B1B34] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {r}
              </Link>
            ))}
          </div>
          <Link href="/painel/crm/lista" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">
            Ver em lista
          </Link>
          <Link href="/painel/atendimento" className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700">
            Abrir conversas
          </Link>
        </div>
      </div>
      <form className="flex flex-wrap items-center gap-2" action="/painel/crm">
        {periodo !== '30' && <input type="hidden" name="p" value={periodo} />}
        <input
          name="q"
          defaultValue={sp.q || ''}
          placeholder="Buscar nome, telefone, etiqueta ou mensagem"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto sm:min-w-0 sm:max-w-md sm:flex-1"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" name="com" value="avisos" defaultChecked={!soConversas} /> incluir quem só recebeu avisos
        </label>
        <button className="rounded-lg bg-[#0B1B34] px-4 py-2 text-sm text-white">Buscar</button>
      </form>
      {!integracoes.whatsapp() && !integracoes.evolution() && (
        <Aviso>
          O WhatsApp ainda não está conectado. <Link href="/painel/whatsapp" className="underline">Conectar o WhatsApp</Link>
        </Aviso>
      )}
      {erroPedidos && <Aviso tipo="erro">Não consegui ler os pedidos do WooCommerce: {erroPedidos}</Aviso>}
      <Quadro colunas={ETAPAS.map((e) => ({ id: e.id, nome: e.nome }))} cartoes={cartoes} agora={agora} />
    </div>
  );
}
