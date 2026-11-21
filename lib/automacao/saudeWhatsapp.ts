// Conferência (só leitura) da saúde do WhatsApp da loja (Evolution): conexão, webhook de recebimento,
// IA, lembretes automáticos (Pix, cartão recusado, carrinho) e avisos de pedido.
// Sai no log PÚBLICO do GitHub Actions: só contagens e estados, nada de telefone, nome ou texto.
import { integracoes } from './config';
import { estadoConexao, situacaoWebhook, ultimosDiag } from './evolution';
import { previaLembretes } from './lembretesWhats';
import { listarPedidos, meta } from './woocommerce';
import { M } from './pedidos';

const minAtras = (ms: number) => Math.round((Date.now() - ms) / 60_000);

export async function saudeWhatsapp() {
  const r: Record<string, unknown> = { canal: integracoes.whatsapp() ? 'API oficial (Meta)' : integracoes.evolution() ? 'Evolution' : 'nenhum' };

  if (integracoes.evolution()) {
    r.conexao = await estadoConexao();
    r.webhook = await situacaoWebhook()
      .then(({ endereco: _e, ...w }) => w) // eslint-disable-line @typescript-eslint/no-unused-vars
      .catch((e) => ({ erro: (e as Error).message.slice(0, 120) }));
    const diag = await ultimosDiag().catch(() => []);
    r.ultimasMensagensRecebidas = diag.slice(0, 5).map((d) => ({ minAtras: minAtras(d.em), resultado: d.resultado.slice(0, 80) }));
  }

  r.lembretes = await previaLembretes().catch((e) => ({ erro: (e as Error).message.slice(0, 120) }));

  // Avisos de pedido dos últimos 7 dias, por canal real (o sistema grava "nenhum canal" quando não conseguiu)
  const desde = new Date(Date.now() - 7 * 86_400_000);
  const pagos = await listarPedidos('processing,completed', desde, 100).catch(() => []);
  const conta = (chave: string) => {
    const c: Record<string, number> = { whatsapp: 0, email: 0, 'nenhum canal': 0, 'ainda não': 0 };
    for (const p of pagos) {
      const v = meta(p, chave);
      if (!v) c['ainda não']++;
      else if (v === 'nenhum canal') c['nenhum canal']++;
      else for (const canal of v.split(',')) c[canal] = (c[canal] || 0) + 1;
    }
    return c;
  };
  const semCanal = pagos.filter((p) => meta(p, M.avisoPago) === 'nenhum canal').map((p) => p.id);
  r.avisosDePedido7dias = { pagos: pagos.length, pagamentoConfirmado: conta(M.avisoPago), pedidoEnviado: conta(M.avisoEnviado), pedidosSemNenhumAvisoDePagamento: semCanal };

  const falhados = await listarPedidos('failed', desde, 50).catch(() => []);
  r.cartaoRecusado7dias = falhados.length;
  return r;
}
