import { Aviso, Cartao, Chip } from '../../../components/painel/ui';
import { estadoTokens } from '../../../lib/automacao/bling';
import { config, integracoes } from '../../../lib/automacao/config';
import { exigirLogin } from '../../../lib/painel/auth';
import { conectarBling } from '../actions';

type Linha = { nome: string; ok: boolean; detalhe: string; liga?: { rotulo: string; ligado: boolean }[] };

export default async function Integracoes() {
  await exigirLogin();
  const tokens = integracoes.bling() ? await estadoTokens().catch(() => null) : null;

  const linhas: Linha[] = [
    {
      nome: 'WooCommerce (pedidos e catálogo)',
      ok: integracoes.woo(),
      detalhe: integracoes.woo() ? `${config.woo.url} · webhooks ${config.woo.webhookSecret ? 'com segredo' : 'SEM segredo (WC_WEBHOOK_SECRET)'}` : 'Falta WC_CONSUMER_KEY / WC_CONSUMER_SECRET',
      liga: [{ rotulo: 'Concluir pedido ao enviar', ligado: config.woo.concluirAoEnviar }],
    },
    {
      nome: 'AppMax (pagamento)',
      ok: integracoes.woo(),
      detalhe: 'Funciona pelo plugin dentro do WooCommerce: o painel lê o status e o método de pagamento dos pedidos. Estornos e chargebacks continuam no painel da AppMax.',
    },
    {
      nome: 'Upstash (memória das automações)',
      ok: integracoes.kv(),
      detalhe: integracoes.kv() ? 'Conectado' : 'Sem Upstash: conversas, tokens do Bling e travas não ficam salvos.',
    },
    {
      nome: 'Bling (pedido de venda, NF-e, estoque)',
      ok: integracoes.bling() && Boolean(tokens?.salvosNoKv),
      detalhe: !integracoes.bling()
        ? 'Falta BLING_CLIENT_ID / BLING_CLIENT_SECRET'
        : tokens?.salvosNoKv
          ? `Autorizado${tokens.expiraEm ? ` · token renova em ${tokens.expiraEm}` : ''}`
          : 'Configurado, mas ainda não autorizado: clique em "Conectar Bling".',
      liga: [
        { rotulo: 'Enviar pedidos', ligado: config.bling.enviarPedidos },
        { rotulo: 'Emitir NF-e', ligado: config.bling.emitirNfe },
        { rotulo: 'Sincronizar estoque', ligado: config.bling.sincronizarEstoque },
      ],
    },
    {
      nome: 'Melhor Envio (frete, etiqueta, rastreio)',
      ok: integracoes.melhorEnvio(),
      detalhe: integracoes.melhorEnvio() ? (config.melhorEnvio.sandbox ? 'Modo SANDBOX (teste)' : 'Produção') : 'Falta MELHOR_ENVIO_TOKEN',
      liga: [
        { rotulo: 'Criar envios', ligado: config.melhorEnvio.criarEnvios },
        { rotulo: 'Comprar etiqueta', ligado: config.melhorEnvio.comprarEtiqueta },
      ],
    },
    {
      nome: 'WhatsApp (avisos e atendimento)',
      ok: integracoes.whatsapp(),
      detalhe: integracoes.whatsapp() ? `Coexistência com o app: ${config.whatsapp.coexistencia ? 'sim' : 'não'}` : 'Falta WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID',
      liga: [{ rotulo: 'Respostas automáticas', ligado: config.whatsapp.respostas.ativas }],
    },
    {
      nome: 'WhatsApp pelo QR Code (Evolution)',
      ok: integracoes.evolution(),
      detalhe: integracoes.evolution()
        ? 'Configurada. Veja a conexão e o QR Code em Integrações → WhatsApp.'
        : 'Falta EVOLUTION_URL / EVOLUTION_API_KEY / EVOLUTION_WEBHOOK_TOKEN',
    },
    {
      nome: 'E-mail (Resend)',
      ok: integracoes.email(),
      detalhe: integracoes.email() ? `Alertas para ${config.email.admin || '— (EMAIL_ADMIN vazio)'}` : 'Falta RESEND_API_KEY / EMAIL_REMETENTE',
    },
    {
      nome: 'Meta Ads (API de Conversões)',
      ok: integracoes.meta(),
      detalhe: integracoes.meta() ? 'Compras enviadas ao Meta quando o pagamento é aprovado' : 'Falta META_CAPI_TOKEN',
    },
    {
      nome: 'Rotina a cada 30 min',
      ok: Boolean(config.cronSecret),
      detalhe: config.cronSecret ? 'CRON_SECRET configurado (confira os secrets do GitHub Actions)' : 'Falta CRON_SECRET',
    },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl">Integrações</h1>
        <a href="/painel/whatsapp" className="text-sm px-3 py-1.5 rounded-lg bg-[#0B1B34] text-white">WhatsApp (QR Code)</a>
      </div>
      <p className="text-sm text-slate-500">Situação de cada sistema ligado à loja. As chaves ficam na Vercel (Settings → Environment Variables).</p>
      <Cartao>
        <ul className="divide-y divide-slate-100">
          {linhas.map((l) => (
            <li key={l.nome} className="py-3">
              <div className="flex items-center gap-2">
                <Chip ok={l.ok}>{l.ok ? 'ok' : 'pendente'}</Chip>
                <span className="font-medium">{l.nome}</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">{l.detalhe}</p>
              {l.nome.startsWith('Bling') && integracoes.bling() && (
                <form action={conectarBling} className="mt-2">
                  <button className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">
                    {tokens?.salvosNoKv ? 'Reconectar Bling' : 'Conectar Bling'}
                  </button>
                  <span className="text-xs text-slate-500 ml-2">Use depois de mudar os escopos do aplicativo no Bling.</span>
                </form>
              )}
              {l.liga && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {l.liga.map((x) => (
                    <span key={x.rotulo} className="text-xs text-slate-600">
                      {x.rotulo}: <b className={x.ligado ? 'text-emerald-700' : 'text-slate-400'}>{x.ligado ? 'ligado' : 'desligado'}</b>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Cartao>
      <Aviso>
        Para ligar ou desligar uma função, altere a variável correspondente na Vercel e faça um novo deploy. A lista completa está no AUTOMACAO.md.
      </Aviso>
    </div>
  );
}
