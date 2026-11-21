// Conferência (só leitura): os pedidos pagos já foram enviados e o cliente foi avisado?
// Sai no log PÚBLICO do GitHub Actions: só número do pedido, dias e o que falta. Nada de nome,
// telefone, endereço, rastreio ou valores.
import { listarPedidos, meta, WcPedido } from './woocommerce';
import { M } from './pedidos';
import { telefoneSuspeito } from './whatsapp';

const dias = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(`${iso}Z`).getTime()) / 86_400_000) : null);

export async function conferirEnvios(janelaDias = 30) {
  const pagos: WcPedido[] = await listarPedidos('processing,completed', new Date(Date.now() - janelaDias * 86_400_000), 200);
  const cont = { pagos: pagos.length, enviados: 0, aEnviar: 0, avisadosPago: 0, avisadosEnvio: 0, comNfe: 0, comEtiqueta: 0 };
  const pendencias: { pedido: number; status: string; diasDesdePago: number | null; entrega: string; falta: string[] }[] = [];

  for (const p of pagos) {
    const rastreio = Boolean(meta(p, M.rastreio) || meta(p, '_correios_tracking_code'));
    const enviado = rastreio || p.status === 'completed';
    // "nenhum canal" = o sistema tentou e não conseguiu (ex.: número sem WhatsApp): não conta como avisado
    const saiu = (v?: string) => Boolean(v && v !== 'nenhum canal');
    const avisoPago = saiu(meta(p, M.avisoPago));
    const avisoEnvio = saiu(meta(p, M.avisoEnviado));
    const nfe = Boolean(meta(p, M.nfeChave));
    const etiqueta = Boolean(meta(p, M.meEtiqueta) || meta(p, M.meEnvio));
    if (enviado) cont.enviados++;
    else cont.aEnviar++;
    if (avisoPago) cont.avisadosPago++;
    if (avisoEnvio) cont.avisadosEnvio++;
    if (nfe) cont.comNfe++;
    if (etiqueta) cont.comEtiqueta++;

    const falta: string[] = [];
    if (!nfe) falta.push('nota fiscal');
    if (!enviado) falta.push(etiqueta ? 'postar (etiqueta já existe)' : 'etiqueta/envio');
    if (enviado && !rastreio) falta.push('código de rastreio no pedido');
    if (!avisoPago) falta.push('aviso "pagamento confirmado"');
    if (enviado && !avisoEnvio) falta.push('aviso "pedido enviado"');
    if (meta(p, M.erro)) falta.push('erro na automação');
    if (telefoneSuspeito(p.billing?.phone || '')) falta.push('telefone suspeito');
    if (falta.length)
      pendencias.push({
        pedido: p.id,
        status: p.status === 'completed' ? 'concluído' : 'pago · a enviar',
        diasDesdePago: dias(p.date_paid_gmt || p.date_created_gmt),
        entrega: p.shipping_lines?.[0]?.method_title?.replace(/\s*\(.*\)$/, '') || 'sem frete',
        falta,
      });
  }
  pendencias.sort((a, b) => (b.diasDesdePago ?? 0) - (a.diasDesdePago ?? 0));
  return { janelaDias, ...cont, pendencias };
}
