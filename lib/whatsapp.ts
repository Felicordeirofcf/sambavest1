import type { CartItem } from '../store/cartStore';

export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5521996959903'; // troque no .env.local

function formatPrice(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Monta a mensagem de pedido formatada para enviar via WhatsApp.
 * A loja ainda não está conectada a um checkout de pagamento (Nuvemshop/Pix/Cartão);
 * por padrão, o fechamento do pedido acontece por conversa no WhatsApp.
 * Quando você conectar uma Nuvemshop real (lib/nuvemshop.ts), pode trocar este fluxo
 * pelo redirecionamento automático para o checkout oficial.
 */
export function buildOrderMessage(items: CartItem[], subtotal: number): string {
  const linhas = items.map(
    (item) =>
      `• ${item.name} — Tam. ${item.size} — Qtd: ${item.quantity} — ${formatPrice(
        item.price * item.quantity
      )}`
  );

  return [
    'Olá! Quero fechar este pedido na Samba Vest:',
    '',
    ...linhas,
    '',
    `Total: ${formatPrice(subtotal)}`,
  ].join('\n');
}

export function buildWhatsappOrderLink(items: CartItem[], subtotal: number): string {
  const message = encodeURIComponent(buildOrderMessage(items, subtotal));
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
}
