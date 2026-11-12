import Link from 'next/link';
import { Aviso, Cartao } from '../../../components/painel/ui';
import { config, integracoes } from '../../../lib/automacao/config';
import { estadoConexao, qrCode } from '../../../lib/automacao/evolution';
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

  return (
    <div className="space-y-5 max-w-4xl">
      {!conectado && estado !== 'erro' && estado !== 'inexistente' && <meta httpEquiv="refresh" content="20" />}
      <div>
        <h1 className="text-2xl md:text-3xl">WhatsApp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Conexão pelo QR Code (Evolution). As conversas aparecem no <Link href="/painel/crm" className="underline">CRM</Link> e você responde por
          aqui. Nada é enviado automaticamente.
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
