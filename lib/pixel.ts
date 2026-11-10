// Eventos do Meta Pixel no navegador (visita de produto, sacola, checkout).
// A COMPRA é enviada pelo servidor (API de Conversões) quando o pagamento é aprovado,
// porque o pagamento acontece fora do site (página da AppMax) e o Pixel não vê.

type Fbq = (acao: 'track', evento: string, dados?: Record<string, unknown>, opcoes?: { eventID?: string }) => void;

export type ItemPixel = { id: number | string; quantidade: number; preco: number };

export function rastrear(evento: string, dados: Record<string, unknown> = {}, eventId?: string): void {
  if (typeof window === 'undefined') return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (typeof fbq !== 'function') return;
  try {
    fbq('track', evento, dados, eventId ? { eventID: eventId } : undefined);
  } catch {
    // nunca deixa o rastreamento quebrar a loja
  }
}

export function dadosItens(itens: ItemPixel[]) {
  return {
    currency: 'BRL',
    value: Number(itens.reduce((s, i) => s + i.preco * i.quantidade, 0).toFixed(2)),
    content_type: 'product',
    content_ids: itens.map((i) => String(i.id)),
    contents: itens.map((i) => ({ id: String(i.id), quantity: i.quantidade, item_price: i.preco })),
    num_items: itens.reduce((s, i) => s + i.quantidade, 0),
  };
}
