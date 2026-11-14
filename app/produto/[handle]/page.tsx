// /produto/[handle]: página da camisa (o código fica em produtoServidor.tsx, junto com /produto/[handle]/[modelo]).
import type { Metadata } from 'next';
import { metadadosProduto, PaginaProduto } from './produtoServidor';

// Página guardada em cache (ISR): o cliente recebe a página pronta na hora e ela é refeita em
// segundo plano no máximo a cada 2 min. Preço e estoque são conferidos de novo na sacola e no checkout.
export const revalidate = 120;
export const dynamicParams = true;
/** Sem lista prévia: cada camisa é gerada na primeira visita e depois servida do cache. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  return metadadosProduto((await params).handle);
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  return <PaginaProduto handle={(await params).handle} />;
}
