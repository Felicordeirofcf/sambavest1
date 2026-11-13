// Monitoramento da loja (saúde do site, rotinas, integrações): usado na Configuração e no aviso da tela inicial.
import type { EstadoServico } from '../../components/painel/analytics';
import { alertasLigados, chatTelegram } from '../automacao/alertas';
import { config, integracoes } from '../automacao/config';
import { falhasNosDias, TIPOS_FALHA, ultimaExecucao, type TipoFalha } from '../automacao/monitor';
import { ultimaSaude } from '../automacao/saude';
import { quando } from './analytics';
import type { PedidoResumo } from './dados';
import { diaLocal, pago, type pendencias } from './metricas';

const DIA = 86_400_000;
const haQuanto = (ms: number, agora: number) => {
  const min = Math.round((agora - ms) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
};

export type Servico = { nome: string; estado: EstadoServico; detalhe: string };

export async function montarMonitoramento({
  pedidos,
  erro,
  pend,
  agora,
}: {
  pedidos: PedidoResumo[];
  erro: string;
  pend: ReturnType<typeof pendencias>;
  agora: number;
}): Promise<Servico[]> {
  void config;
  const [cron, webhook, alerta, chat] = await Promise.all([
    ultimaExecucao('cron'),
    ultimaExecucao('webhook-woo'),
    ultimaExecucao('alerta'),
    chatTelegram().catch(() => undefined),
  ]);
  const contaAds = integracoes.metaAds() ? await (await import('../../lib/automacao/metaAds')).contaAnuncios().catch(() => null) : null;
  const [saude, falhas24h] = await Promise.all([ultimaSaude(), falhasNosDias([diaLocal(agora), diaLocal(agora - DIA)])]);
  const ultimoPago = pedidos.filter(pago).sort((a, b) => quando(b) - quando(a))[0];
  const recusados24h = pedidos.filter((p) => p.status === 'failed' && agora - p.criado < DIA).length;
  const qtdPend = (tipo: string) => pend.find((p) => p.tipo === tipo)?.pedidos.length || 0;
  const totalFalhas = (Object.keys(falhas24h) as TipoFalha[]).reduce((s, k) => s + falhas24h[k], 0);
  const servicosSaude: { nome: string; estado: EstadoServico; detalhe: string }[] = (saude?.checks || [])
    .filter((c) => c.nome !== 'WooCommerce' && c.nome !== 'Banco rápido (Upstash)')
    .map((c) => ({
      nome: c.nome,
      estado: /não configurado/.test(c.detalhe) ? 'off' : c.ok ? 'ok' : 'erro',
      detalhe: `${c.ok ? `${c.detalhe} em ${(c.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : c.detalhe} · teste ${haQuanto(saude!.em, agora)}`,
    }));
  const servicos: Servico[] = [
    ...servicosSaude,
    {
      nome: 'Checkout e frete (até 48 h)',
      estado: falhas24h['frete-erro'] || falhas24h['checkout-erro'] ? 'erro' : totalFalhas ? 'atencao' : 'ok',
      detalhe: totalFalhas
        ? (Object.keys(falhas24h) as TipoFalha[])
            .filter((k) => falhas24h[k])
            .map((k) => `${TIPOS_FALHA[k]}: ${falhas24h[k]}`)
            .join(' · ')
        : 'nenhuma falha de frete ou checkout registrada',
    },
    {
      nome: 'WooCommerce (loja)',
      estado: erro ? 'erro' : 'ok',
      detalhe: erro ? `não respondeu: ${erro}` : `${pedidos.length} pedidos dos últimos 60 dias lidos agora`,
    },
    {
      nome: 'Pagamentos (AppMax)',
      estado: !ultimoPago || agora - quando(ultimoPago) > 2 * DIA || recusados24h >= 3 ? 'atencao' : 'ok',
      detalhe: `${ultimoPago ? `último pagamento aprovado ${haQuanto(quando(ultimoPago), agora)}` : 'nenhum pagamento aprovado em 60 dias'}${recusados24h ? ` · ${recusados24h} recusado(s) nas últimas 24 h` : ''}`,
    },
    {
      nome: 'Rotina automática (cron)',
      estado: !cron ? 'atencao' : !cron.ok ? 'erro' : agora - cron.em < 40 * 60_000 ? 'ok' : agora - cron.em < 3 * 3_600_000 ? 'atencao' : 'erro',
      detalhe: cron ? `última execução ${haQuanto(cron.em, agora)}${cron.ok ? '' : ` · ${cron.detalhe}`}` : 'ainda sem registro (passa a contar depois desta atualização)',
    },
    {
      nome: 'Webhook de pedidos',
      estado: webhook ? 'ok' : 'atencao',
      detalhe: webhook ? `último aviso do WooCommerce ${haQuanto(webhook.em, agora)} (${webhook.detalhe})` : 'ainda sem registro (aparece no próximo pedido)',
    },
    {
      nome: 'Bling',
      estado: !integracoes.bling() ? 'off' : qtdPend('bling') ? 'atencao' : 'ok',
      detalhe: !integracoes.bling() ? 'não configurado' : qtdPend('bling') ? `${qtdPend('bling')} pedido(s) pago(s) ainda sem pedido no Bling` : 'pedidos pagos chegando no Bling',
    },
    {
      nome: 'Melhor Envio',
      estado: !integracoes.melhorEnvio() ? 'off' : qtdPend('me') ? 'atencao' : 'ok',
      detalhe: !integracoes.melhorEnvio() ? 'não configurado' : qtdPend('me') ? `${qtdPend('me')} pedido(s) sem envio criado` : 'envios em dia',
    },
    {
      nome: 'Alertas no celular',
      estado: !alertasLigados() ? 'off' : alerta && !alerta.ok ? 'erro' : integracoes.telegram() && !chat ? 'atencao' : 'ok',
      detalhe: !alertasLigados()
        ? 'conecte o Telegram em Alertas no celular'
        : alerta
          ? `último alerta ${haQuanto(alerta.em, agora)}${alerta.ok ? '' : ` · falhou: ${alerta.detalhe}`}`
          : integracoes.telegram() && !chat
            ? 'robô criado, falta conectar o seu Telegram'
            : 'pronto, nenhum alerta enviado ainda',
    },
    {
      nome: 'Anúncios (Meta)',
      estado: !integracoes.metaAds() ? 'off' : contaAds === null ? 'atencao' : contaAds.status === 1 ? 'ok' : 'erro',
      detalhe: !integracoes.metaAds()
        ? 'cadastre o META_ADS_TOKEN para ver gasto e cliques'
        : contaAds === null
          ? 'não consegui ler a conta de anúncios agora'
          : `${contaAds.status === 1 ? 'conta ativa' : 'conta parada'}${contaAds.saldo ? ` · ${contaAds.saldo}` : ''}`,
    },
    {
      nome: 'Banco rápido (Upstash)',
      estado: integracoes.kv() ? 'ok' : 'erro',
      detalhe: integracoes.kv() ? 'guardando conversas, CRM, funil e travas' : 'não configurado: funil, CRM e travas não funcionam',
    },
  ];

  return servicos;
}
