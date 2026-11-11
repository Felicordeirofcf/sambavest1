import Link from 'next/link';
import Quadro, { CartaoQuadro } from '../../../../components/painel/quadro';
import { Aviso } from '../../../../components/painel/ui';
import { integracoes } from '../../../../lib/automacao/config';
import { JANELA_MS } from '../../../../lib/automacao/conversas';
import { exigirLogin } from '../../../../lib/painel/auth';
import { ETAPAS, nomeDoContato } from '../../../../lib/painel/crm';
import { contatosCrm } from '../../../../lib/painel/crmDados';

const agoraMs = () => Date.now();
const HORAS = [24, 48, 72];

export default async function QuadroCrm({ searchParams }: { searchParams: Promise<{ h?: string; com?: string }> }) {
  await exigirLogin();
  const sp = await searchParams;
  const horas = HORAS.includes(Number(sp.h)) ? Number(sp.h) : 48;
  const soConversas = sp.com !== 'avisos';

  if (!integracoes.kv()) {
    return <Aviso tipo="erro">O CRM precisa do Upstash (KV) configurado para guardar os contatos.</Aviso>;
  }

  const { contatos } = await contatosCrm();
  const agora = agoraMs();
  const cartoes: CartaoQuadro[] = contatos
    .filter((c) => agora - c.ultimaAtividade <= horas * 3_600_000)
    .filter((c) => (soConversas ? c.mensagensCliente > 0 : true))
    .map((c) => ({
      chave: c.chave,
      nome: nomeDoContato(c),
      etapa: c.etapa,
      ultimaMensagem: c.ultimaMensagem || '',
      ultimaDe: c.ultimaDe || '',
      ultimaAtividade: c.ultimaAtividade,
      naoLidas: c.naoLidas,
      janelaAberta: Boolean(c.ultimaDoCliente && agora - c.ultimaDoCliente < JANELA_MS - 60_000),
      pagos: c.pagos,
      gasto: c.gasto,
      pendentes: c.pendentes,
      etiquetas: c.etiquetas,
    }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">CRM · Quadro</h1>
          <p className="text-sm text-slate-500">
            Conversas com movimento nas últimas {horas} horas ({cartoes.length}). Arraste o cartão para mudar a etapa; clique no nome para abrir a conversa.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {HORAS.map((h) => (
              <Link key={h} href={`/painel/crm/quadro?h=${h}${soConversas ? '' : '&com=avisos'}`} className={`px-3 py-1 rounded-md ${h === horas ? 'bg-[#0B1B34] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {h}h
              </Link>
            ))}
          </div>
          <Link href="/painel/crm" className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            Ver em lista
          </Link>
        </div>
      </div>
      {!integracoes.whatsapp() && <Aviso>O WhatsApp ainda não está conectado. Assim que conectar, as conversas aparecem aqui.</Aviso>}
      <Quadro colunas={ETAPAS.map((e) => ({ id: e.id, nome: e.nome }))} cartoes={cartoes} agora={agora} />
    </div>
  );
}
