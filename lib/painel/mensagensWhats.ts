// Mensagens prontas de WhatsApp para o dono mandar ao cliente a partir da página do pedido.
// Só monta o texto e o link wa.me: quem envia é o dono, pelo próprio WhatsApp.
import type { PedidoResumo } from './dados';

export type MensagemPronta = { id: string; rotulo: string; texto: string; destaque?: boolean };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const primeiroNome = (nome: string) => (nome || '').trim().split(/\s+/)[0] || '';

export function mensagensDoPedido(
  p: PedidoResumo,
  extras: { linkPagamento?: string; linkRastreio?: string } = {}
): MensagemPronta[] {
  const nome = primeiroNome(p.cliente.nome);
  const oi = nome ? `Oi, ${nome}! ` : 'Oi! ';
  const itens = p.itens.map((i) => `• ${i.qtd}x ${i.nome}`).join('\n');
  const resumo = `Pedido #${p.id}\n${itens}\nTotal: ${brl(p.total)}${p.freteNome ? ` (frete ${p.freteNome})` : ''}`;
  const pix = p.metodo.includes('pix');
  const r: MensagemPronta[] = [];

  if (p.status === 'pending' || p.status === 'on-hold' || p.status === 'failed') {
    r.push({
      id: 'recebido-pendente',
      rotulo: 'Recebemos o pedido (pagamento pendente)',
      destaque: true,
      texto:
        `${oi}Aqui é da Samba Vest 💙❤️ Recebemos o seu pedido!\n\n${resumo}\n\n` +
        (p.status === 'failed'
          ? 'Vi que o pagamento não foi aprovado. Quer tentar de novo ou prefere pagar no Pix? Te ajudo por aqui.'
          : `O pagamento ainda está pendente${pix ? ' (Pix)' : ''}. ` +
            (extras.linkPagamento ? `Se precisar, é só concluir por este link: ${extras.linkPagamento}\n\n` : '') +
            'Qualquer dúvida sobre tamanho, frete ou pagamento, me chama aqui.'),
    });
  }
  if (p.status === 'processing') {
    r.push({
      id: 'recebido-pago',
      rotulo: 'Recebemos o pedido (pago)',
      destaque: true,
      texto: `${oi}Aqui é da Samba Vest 💙❤️ Recebemos o seu pedido e o pagamento foi aprovado!\n\n${resumo}\n\nJá estamos separando a sua camisa. Assim que for postada, mando o código de rastreio por aqui.`,
    });
  }
  if (extras.linkRastreio && (p.status === 'processing' || p.status === 'completed')) {
    r.push({
      id: 'enviado',
      rotulo: 'Pedido enviado (rastreio)',
      destaque: p.status === 'completed',
      texto: `${oi}Sua camisa já está a caminho! 🚚\n\nPedido #${p.id}\nAcompanhe a entrega: ${extras.linkRastreio}\n\nQualquer coisa, é só chamar.`,
    });
  }
  if (p.status === 'completed') {
    r.push({
      id: 'pos-venda',
      rotulo: 'Pós-venda (chegou?)',
      texto: `${oi}A sua camisa chegou certinha? Se puder, manda uma foto vestindo pra gente 📸 Adoramos ver! Obrigado por comprar na Samba Vest.`,
    });
  }
  r.push({
    id: 'livre',
    rotulo: 'Só abrir a conversa',
    texto: `${oi}Aqui é da Samba Vest, sobre o seu pedido #${p.id}.`,
  });
  return r;
}

export const linkWhats = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
