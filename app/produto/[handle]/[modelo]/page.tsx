// Link por modelo (ex.: /produto/beija-flor-enredo/vestido), usado pela IA do WhatsApp.
// A vitrine voltou para a página única da camisa: este endereço só redireciona para ela.
import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ handle: string; modelo: string }> }) {
  const { handle } = await params;
  redirect(`/produto/${encodeURIComponent(handle)}`);
}
