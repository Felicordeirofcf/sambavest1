// Tela de Pix dentro do site. O link leva a chave do pedido (?k=): quem não tem a chave não vê nada.
import type { Metadata } from 'next';
import PixTela from '../../../../components/pagamento/PixTela';

export const metadata: Metadata = {
  title: 'Pague com Pix | Samba Vest',
  robots: { index: false, follow: false },
  // A chave está na URL: não deixa vazar para outros sites pelo Referer
  referrer: 'no-referrer',
};

export default async function Page({ params, searchParams }: { params: Promise<{ pedido: string }>; searchParams: Promise<{ k?: string }> }) {
  const { pedido } = await params;
  const { k } = await searchParams;
  return <PixTela pedido={Number(pedido) || 0} chave={k || ''} whatsapp={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5521996959903'} />;
}
