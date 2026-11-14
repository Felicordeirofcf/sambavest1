// O atendimento agora fica dentro do painel (/painel/atendimento). Mantém os links antigos funcionando.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AtendimentoAntigo({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  redirect(`/painel/atendimento${n ? `?n=${encodeURIComponent(n)}` : ''}`);
}
