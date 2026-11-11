// Painel simples para ver as conversas recentes do WhatsApp e responder dentro da janela de 24h.
import type { Metadata } from 'next';
import Link from 'next/link';
import { config, integracoes } from '../../lib/automacao/config';
import { Conversa, janelaAberta, listarConversas, obterConversa } from '../../lib/automacao/conversas';
import { logado } from '../../lib/automacao/painel';
import { login, logout, resolver, responder } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Atendimento', robots: { index: false, follow: false } };

const fmt = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const AUTOR: Record<string, string> = { cliente: 'Cliente', robo: 'Robô', loja: 'Loja', aviso: 'Aviso automático' };

function Login({ erro }: { erro?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <form action={login} className="w-full max-w-xs flex flex-col gap-3">
        <a href="/painel" className="text-sm underline text-gray-600">← Voltar ao painel</a>
        <h1 className="text-xl font-bold text-[#0B1B34]">Atendimento WhatsApp</h1>
        <p className="text-xs text-gray-500">Use a mesma senha do painel de gestão.</p>
        {!config.whatsapp.painelSenha && (
          <p className="text-sm text-red-600">Defina ATENDIMENTO_SENHA na Vercel para liberar o painel.</p>
        )}
        {erro === 'senha' && <p className="text-sm text-red-600">Senha incorreta.</p>}
        <input name="senha" type="password" placeholder="Senha" required className="border p-3 rounded" autoFocus />
        <button className="bg-[#0B1B34] text-white p-3 rounded font-semibold">Entrar</button>
      </form>
    </div>
  );
}

function Item({ c, ativo }: { c: Conversa; ativo: boolean }) {
  const ultima = c.mensagens[c.mensagens.length - 1];
  const humano = c.humanoAte && c.humanoAte > Date.now();
  return (
    <Link
      href={`/atendimento?n=${c.numero}`}
      className={`block p-3 border-b hover:bg-gray-50 ${ativo ? 'bg-yellow-50' : ''}`}
    >
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-semibold truncate">{c.nome || `+${c.numero}`}</span>
        <span className="text-gray-500 shrink-0">{fmt(c.atualizadaEm)}</span>
      </div>
      <div className="flex justify-between gap-2 text-xs text-gray-600 mt-1">
        <span className="truncate">{ultima ? `${AUTOR[ultima.de]}: ${ultima.texto}` : ''}</span>
        <span className="shrink-0 flex gap-1">
          {humano && <span className="bg-orange-100 text-orange-800 px-1 rounded">humano</span>}
          {c.naoLidas > 0 && <span className="bg-green-600 text-white px-1.5 rounded-full">{c.naoLidas}</span>}
        </span>
      </div>
    </Link>
  );
}

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ n?: string; erro?: string }> }) {
  const { n, erro } = await searchParams;
  if (!(await logado())) return <Login erro={erro} />;

  const conversas = await listarConversas(80);
  const aberta = n ? await obterConversa(n) : null;
  const podeResponder = janelaAberta(aberta);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <Link href="/painel" className="text-sm px-3 py-1.5 rounded-lg bg-[#0B1B34] text-white hover:bg-[#C9A227] hover:text-[#0B1B34]">
            ← Voltar ao painel
          </Link>
          <h1 className="text-xl font-bold text-[#0B1B34]">Atendimento WhatsApp</h1>
        </div>
        <div className="flex gap-4 items-center">
          <Link href="/atendimento/simulador" className="text-sm underline text-gray-600">Simulador do robô</Link>
          <form action={logout}>
            <button className="text-sm underline text-gray-600">Sair</button>
          </form>
        </div>
      </div>
      {!integracoes.kv() && (
        <p className="mb-4 text-sm bg-red-50 text-red-700 p-3 rounded">
          Upstash não configurado: as conversas ficam só na memória e somem a cada execução.
        </p>
      )}
      {config.whatsapp.coexistencia && (
        <p className="mb-4 text-sm bg-green-50 text-green-800 p-3 rounded">
          Coexistência ligada: você também pode responder pelo app WhatsApp Business (celular ou PC). O que você
          mandar por lá aparece aqui como &quot;pelo app&quot; e o robô para de responder naquela conversa.
        </p>
      )}
      {!config.whatsapp.respostas.ativas && (
        <p className="mb-4 text-sm bg-gray-50 text-gray-700 p-3 rounded">
          Respostas automáticas desligadas (WHATSAPP_RESPOSTAS_AUTOMATICAS). Todas as mensagens ficam para você.
        </p>
      )}
      <div className="grid md:grid-cols-[320px_1fr] border rounded min-h-[60vh]">
        <div className="border-r overflow-y-auto max-h-[75vh]">
          {conversas.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhuma conversa nos últimos 12 meses.</p>}
          {conversas.map((c) => (
            <Item key={c.numero} c={c} ativo={aberta?.numero === c.numero} />
          ))}
        </div>
        <div className="flex flex-col">
          {!aberta ? (
            <p className="p-6 text-sm text-gray-500">Escolha uma conversa.</p>
          ) : (
            <>
              <div className="p-3 border-b flex flex-wrap gap-2 justify-between items-center">
                <div>
                  <div className="font-semibold">{aberta.nome || `+${aberta.numero}`}</div>
                  <div className="text-xs text-gray-500">
                    +{aberta.numero} · <a className="underline" href={`https://wa.me/${aberta.numero}`} target="_blank">abrir no WhatsApp</a>
                    {aberta.pedidos?.length ? <> · pedidos {aberta.pedidos.map((p) => `#${p}`).join(', ')}</> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={resolver}>
                    <input type="hidden" name="numero" value={aberta.numero} />
                    <button className="text-xs border px-2 py-1 rounded">Marcar como lida</button>
                  </form>
                  {aberta.humanoAte && aberta.humanoAte > Date.now() && (
                    <form action={resolver}>
                      <input type="hidden" name="numero" value={aberta.numero} />
                      <input type="hidden" name="robo" value="1" />
                      <button className="text-xs border px-2 py-1 rounded">Devolver ao robô</button>
                    </form>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[55vh] p-3 flex flex-col gap-2 bg-gray-50">
                {[...aberta.mensagens].sort((a, b) => a.em - b.em).map((m, i) => (
                  <div
                    key={m.id || i}
                    className={`max-w-[80%] rounded p-2 text-sm whitespace-pre-wrap ${
                      m.de === 'cliente' ? 'bg-white self-start border' : 'bg-green-100 self-end'
                    }`}
                  >
                    <div className="text-[11px] text-gray-500 mb-1">
                      {AUTOR[m.de]} · {fmt(m.em)}
                      {m.status ? ` · ${m.status}` : ''}
                    </div>
                    {m.texto}
                  </div>
                ))}
              </div>
              {erro && <p className="px-3 pt-2 text-sm text-red-600">{erro}</p>}
              {podeResponder ? (
                <form action={responder} className="p-3 border-t flex gap-2">
                  <input type="hidden" name="numero" value={aberta.numero} />
                  <textarea name="texto" required rows={2} className="flex-1 border rounded p-2 text-sm" placeholder="Responder..." />
                  <button className="bg-[#0B1B34] text-white px-4 rounded text-sm font-semibold">Enviar</button>
                </form>
              ) : (
                <p className="p-3 border-t text-xs text-gray-500">
                  Janela de 24h fechada: o cliente precisa mandar mensagem de novo para receber texto livre.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
