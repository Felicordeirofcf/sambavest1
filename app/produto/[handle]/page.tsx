import { getProductByHandle } from '../../../lib/products';
import ProductClient from './ProductClient';
import { notFound } from 'next/navigation';

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const resolvedParams = await Promise.resolve(params);
  const handleDaUrl = decodeURIComponent(resolvedParams.handle).toLowerCase().trim();

  const product = await getProductByHandle(handleDaUrl);

  if (!product) {
    notFound();
  }

  return <ProductClient product={product} />;
}
