import { Aviso, Cartao, dataHora } from '../../../components/painel/ui';
import { chatTelegram, preferenciasAlertas, TIPOS_ALERTA, TipoAlerta } from '../../../lib/automacao/alertas';
import { config, integracoes } from '../../../lib/automacao/config';
import { ultimaExecucao } from '../../../lib/automacao/monitor';
import { exigirLogin } from '../../../lib/painel/auth';
import { confirmarTelegram, gerarLinkTelegram, salvarAlertas, testarAlerta } from '../actions';

export const dynamic = 'force-dynamic';

const AJUDA: Record<TipoAlerta, string> = {
  venda: 'Cada pedido pago, com itens, cidade e total do dia.',
  recusado: 'Cartão ou Pix recusado: chance de chamar o cliente.',
  erro: 'Falha ao mandar para o Bling, gerar etiqueta etc.',
  pix: `Pix gerado e não pago há mais de ${config.alertas.pixMinutos} min, com link para chamar no WhatsApp.`,
  estoque: `Tamanho com menos de ${config.alertas.estoqueMinimo} unidades (na Black, só as camisas da Black).`,
  resumo: `Todo dia às ${config.alertas.horaResumo}h: vendas, ticket médio e a mais vendida.`,
};

export default async function AlertasPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; link?: string }> }) {
  await exigirLogin();
  const { ok, erro, link } = await searchParams;
  const [prefs, chat, ultimo] = await Promise.all([preferenciasAlertas(), chatTelegram().catch(() => undefined), ultimaExecucao('alerta')]);
  const telegramPronto = integracoes.telegram() && Boolean(chat);
  const whatsPronto = integracoes.evolution() && Boolean(config.alertas.whatsappNumero);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl">Alertas no celular</h1>
        <p className="text-sm text-slate-500 mt-1">Avisos da loja no seu celular pessoal. Escolha abaixo quais você quer receber.</p>
      </div>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao titulo="Onde os alertas chegam">
        <ul className="space-y-4 text-sm">
          <li className="flex flex-wrap items-start gap-3">
            <Estado ok={telegramPronto} />
            <div className="flex-1 min-w-[220px]">
              <p className="font-semibold">Telegram</p>
              {!integracoes.telegram() ? (
                <p className="text-slate-500">
                  Crie um robô: no Telegram, fale com <b>@BotFather</b> → <b>/newbot</b> → escolha um nome. Ele te dá um <b>token</b>. Cadastre
                  esse token na Vercel como <b>TELEGRAM_BOT_TOKEN</b>, faça um Redeploy e volte aqui.
                </p>
              ) : telegramPronto ? (
                <p className="text-slate-500">Conectado. Para trocar de celular, gere o link de novo.</p>
              ) : (
                <p className="text-slate-500">Robô pronto. Falta conectar o seu Telegram: gere o link, abra no celular e toque em &quot;Começar&quot;.</p>
              )}
              {integracoes.telegram() && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={gerarLinkTelegram}>
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">{telegramPronto ? 'Gerar novo link' : '1. Gerar link'}</button>
                  </form>
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#229ED9] px-3 py-1.5 font-semibold text-white">
                      2. Abrir no Telegram
                    </a>
                  )}
                  {link && (
                    <form action={confirmarTelegram}>
                      <button className="rounded-lg bg-[#0B1B34] px-3 py-1.5 font-semibold text-white">3. Já toquei em Começar</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </li>
          <li className="flex flex-wrap items-start gap-3">
            <Estado ok={whatsPronto} />
            <div className="flex-1 min-w-[220px]">
              <p className="font-semibold">WhatsApp pessoal</p>
              <p className="text-slate-500">
                {whatsPronto
                  ? `Ligado: vai para o número terminado em ${config.alertas.whatsappNumero!.slice(-4)}.`
                  : 'Funciona quando a Evolution (Conexão WhatsApp) estiver ligada e a variável ALERTA_WHATSAPP_NUMERO (55 + DDD + número) estiver na Vercel.'}
              </p>
            </div>
          </li>
          <li className="flex flex-wrap items-start gap-3">
            <Estado ok={integracoes.email() && Boolean(config.email.admin)} />
            <div className="flex-1 min-w-[220px]">
              <p className="font-semibold">E-mail ({config.email.admin || 'EMAIL_ADMIN não configurado'})</p>
              <p className="text-slate-500">Continua recebendo os avisos de sempre: novo pedido pago, etiqueta pronta e erros.</p>
            </div>
          </li>
        </ul>
        {ultimo && (
          <p className="mt-4 text-xs text-slate-500">
            Último alerta: {dataHora(ultimo.em)} · {ultimo.ok ? `enviado (${ultimo.detalhe})` : `falhou: ${ultimo.detalhe}`}
          </p>
        )}
      </Cartao>

      <Cartao titulo="Quais alertas receber">
        <form action={salvarAlertas} className="space-y-3">
          {(Object.keys(TIPOS_ALERTA) as TipoAlerta[]).map((t) => (
            <label key={t} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" name={t} defaultChecked={prefs[t]} className="mt-1 h-4 w-4 accent-[#0B1B34]" />
              <span>
                <span className="font-semibold">{TIPOS_ALERTA[t].nome}</span>
                {!prefs[t] && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">pausado</span>}
                <span className="block text-sm text-slate-500">{AJUDA[t]}</span>
              </span>
            </label>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="rounded-lg bg-[#0B1B34] px-4 py-2 text-sm font-semibold text-white">Salvar</button>
          </div>
        </form>
        <form action={testarAlerta} className="mt-3">
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">Enviar alerta de teste agora</button>
        </form>
      </Cartao>
    </div>
  );
}

function Estado({ ok }: { ok: boolean }) {
  return (
    <span
      className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
    >
      <span aria-hidden>{ok ? '●' : '○'}</span>
      {ok ? 'ligado' : 'desligado'}
    </span>
  );
}
