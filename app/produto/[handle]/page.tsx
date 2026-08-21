// app/produto/[handle]/page.tsx
import { getProdutoBlingPorId } from '../../../lib/bling';
import ProductClient from './ProductClient';
import { notFound } from 'next/navigation';

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const resolvedParams = await Promise.resolve(params);
  const handleDaUrl = decodeURIComponent(resolvedParams.handle).trim();

  // Busca o produto diretamente do Bling pelo ID contido na URL
  const product = await getProdutoBlingPorId(handleDaUrl);

  if (!product) {
    notFound();
  }

  return <ProductClient product={product} />;
}