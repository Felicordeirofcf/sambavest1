import Link from 'next/link';
import { Aviso, Cartao } from '../../../components/painel/ui';
import { config, integracoes } from '../../../lib/automacao/config';
import { estadoConexao, qrCode, situacaoWebhook, ultimosDiag } from '../../../lib/automacao/evolution';
import { exigirLogin } from '../../../lib/painel/auth';
import { configurarRecebimentoWhatsapp, criarConexaoWhatsapp, desconectarWhatsapp } from '../actions';

export const maxDuration = 30;

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await exigirLogin();
  const { ok, erro } = await searchParams;

  if (!integracoes.evolution()) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-2xl md:text-3xl">WhatsApp</h1>
        <Aviso>
          Para conectar pelo QR Code, cadastre na Vercel: <b>EVOLUTION_URL</b> (endereço do seu servidor Evolution),{' '}
          <b>EVOLUTION_API_KEY</b> (a chave global dele) e <b>EVOLUTION_WEBHOOK_TOKEN</b> (uma senha longa qualquer). Opcional:{' '}
          <b>EVOLUTION_INSTANCIA</b> (padrão &quot;sambavest&quot;). Depois faça um Redeploy e volte aqui.
        </Aviso>
      </div>
    );
  }

  const { estado, detalhe } = await estadoConexao();
  let qr: Awaited<ReturnType<typeof qrCode>> | null = null;
  let erroQr = '';
  if (estado === 'close' || estado === 'connecting') {
    try {
      qr = await qrCode();
    } catch (e) {
      erroQr = (e as Error).message;
    }
  }
  const conectado = estado === 'open';
  const [webhook, diag] = await Promise.all([
    conectado ? situacaoWebhook().catch((e: Error) => ({ erro: e.message })) : Promise.resolve(null),
    ultimosDiag().catch(() => []),
  ]);
  const hora = (ms: number) =>
    new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-5 max-w-4xl">
      {!conectado && estado !== 'erro' && estado !== 'inexistente' && <meta httpEquiv="refresh" content="20" />}
      <div>
        <h1 className="text-2xl md:text-3xl">WhatsApp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Conexão pelo QR Code (Evolution). As conversas aparecem no <Link href="/painel/atendimento" className="underline">Atendimento</Link>; com a
          IA ligada (WHATSAPP_IA=true), ela responde os clientes por aqui.
        </p>
      </div>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao titulo="Conexão">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
              conectado ? 'bg-emerald-50 text-emerald-800' : estado === 'erro' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            <span aria-hidden className={`w-2 h-2 rounded-full ${conectado ? 'bg-emerald-500' : estado === 'erro' ? 'bg-red-500' : 'bg-amber-500'}`} />
            {conectado
              ? 'Conectado'
              : estado === 'inexistente'
                ? 'Ainda não criado'
                : estado === 'erro'
                  ? 'Servidor da Evolution não respondeu'
                  : 'Aguardando leitura do QR Code'}
          </span>
          <span className="text-sm text-slate-500">Instância: {config.evolution.instancia}</span>
        </div>
        {detalhe && <p className="text-sm text-red-700 mt-3">{detalhe}</p>}

        {estado === 'inexistente' && (
          <form action={criarConexaoWhatsapp} className="mt-4">
            <button className="bg-[#0B1B34] text-white rounded-lg px-4 py-2.5 text-sm font-semibold">Criar conexão e gerar QR Code</button>
          </form>
        )}

        {(estado === 'close' || estado === 'connecting') && (
          <div className="mt-5 grid md:grid-cols-[auto_1fr] gap-6 items-start">
            <div className="bg-white border border-slate-200 rounded-xl p-3 w-fit">
              {qr?.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr.imagem} alt="QR Code para conectar o WhatsApp" width={260} height={260} />
              ) : (
                <p className="text-sm text-slate-500 w-[260px] p-6">{erroQr || 'Gerando QR Code…'}</p>
              )}
            </div>
            <ol className="text-sm space-y-2 list-decimal pl-5">
              <li>No celular da loja, abra o <b>WhatsApp Business</b>.</li>
              <li>
                Toque em <b>⋮ (ou Configurações) → Dispositivos conectados → Conectar um dispositivo</b>.
              </li>
              <li>Aponte a câmera para este QR Code.</li>
              <li>A página se atualiza sozinha a cada 20 segundos; quando conectar, aparece &quot;Conectado&quot;.</li>
              {qr?.codigoPareamento && (
                <li>
                  Sem câmera? Use &quot;Conectar com número de telefone&quot; e digite o código <b className="tracking-widest">{qr.codigoPareamento}</b>.
                </li>
              )}
            </ol>
          </div>
        )}

        {conectado && (
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={configurarRecebimentoWhatsapp}>
              <button className="bg-[#0B1B34] text-white rounded-lg px-4 py-2.5 text-sm font-semibold">Configurar recebimento de mensagens</button>
            </form>
            <Link href="/painel/crm" className="rounded-lg px-4 py-2.5 text-sm border border-slate-300 bg-white">
              Abrir o CRM
            </Link>
          </div>
        )}
      </Cartao>

      {conectado && (
        <Cartao titulo="Recebimento de mensagens (diagnóstico)">
          {webhook && 'erro' in webhook ? (
            <p className="text-sm text-red-700">Não consegui ler o webhook na Evolution: {webhook.erro}</p>
          ) : webhook ? (
            <ul className="text-sm space-y-1.5">
              {[
                [webhook.cadastrado, 'Webhook cadastrado na Evolution', 'Clique em "Configurar recebimento de mensagens".'],
                [webhook.ligado, 'Webhook ligado', 'Clique em "Configurar recebimento de mensagens".'],
                [webhook.apontaParaOSite, 'Aponta para este site', `Está apontando para: ${webhook.endereco || 'nada'}`],
                [webhook.senhaConfere, 'Senha (token) confere com EVOLUTION_WEBHOOK_TOKEN', 'Clique em "Configurar recebimento" de novo.'],
                [
                  webhook.eventos.some((e) => /messages[._]upsert/i.test(e)),
                  'Evento de mensagens novas (MESSAGES_UPSERT) assinado',
                  `Eventos: ${webhook.eventos.join(', ') || 'nenhum'}`,
                ],
              ].map(([ok, rotulo, ajuda]) => (
                <li key={String(rotulo)} className="flex gap-2">
                  <span aria-hidden>{ok ? '✅' : '❌'}</span>
                  <span>
                    {String(rotulo)}
                    {!ok && <span className="block text-xs text-slate-500">{String(ajuda)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">Últimas chegadas no site</h3>
          {diag.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma chamada da Evolution chegou ao site ainda. Se o webhook acima está todo ✅ e você mandou uma mensagem, o servidor da Evolution não está
              conseguindo chamar o site (veja os logs da Evolution).
            </p>
          ) : (
            <ul className="text-sm divide-y divide-slate-100">
              {diag.map((d, i) => (
                <li key={i} className="py-1.5 flex gap-3">
                  <span className="text-slate-500 tabular-nums shrink-0">{hora(d.em)}</span>
                  <span className={d.resultado.startsWith('recebida') ? 'text-emerald-700' : 'text-amber-800'}>{d.resultado}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      <Cartao titulo="Bom saber">
        <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
          <li>O celular continua com o WhatsApp funcionando normalmente; o painel entra como um &quot;dispositivo conectado&quot;, igual ao WhatsApp Web.</li>
          <li>Mensagens recebidas e as que você manda pelo celular aparecem no CRM. Grupos e status ficam de fora.</li>
          <li>
            Esta conexão não é a API oficial da Meta. Use para atender 1 a 1. <b>Não mande mensagens em massa por ela</b>: o WhatsApp pode bloquear o
            número.
          </li>
          <li>Se o celular ficar muitos dias sem internet, a conexão cai e é preciso ler o QR Code de novo aqui.</li>
        </ul>
        {conectado && (
          <form action={desconectarWhatsapp} className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" name="confirmar" value="sim" /> confirmo
            </label>
            <button className="rounded-lg px-3 py-2 border border-red-200 text-red-700 bg-white">Desconectar o WhatsApp do painel</button>
          </form>
        )}
      </Cartao>
    </div>
  );
}
