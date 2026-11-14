// /produto/[handle]/[modelo] (ex.: /produto/camisa-beija-flor-2027/vestido): a mesma página da camisa,
// já no modelo escolhido, e com a prévia do link (WhatsApp/Instagram) mostrando a foto desse modelo.
// O modelo vem do caminho (e não de ?modelo=), então a página continua estática (ISR).
import type { Metadata } from 'next';
import { metadadosProduto, PaginaProduto } from '../produtoServidor';

export const revalidate = 120;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ handle: string; modelo: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle, modelo } = await params;
  return metadadosProduto(handle, modelo);
}

export default async function ProdutoNoModelo({ params }: Params) {
  const { handle, modelo } = await params;
  return <PaginaProduto handle={handle} pedacoModelo={modelo} />;
}
