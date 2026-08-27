'use client';

import ProductCard from './ProductCard';

interface ProductGridProps {
  title?: string;
  subtitle?: string;
  products?: any[];
  limit?: number;
}

export default function ProductGrid({
  title = 'Mais Vendidas ☆',
  subtitle,
  products = [],
  limit = 4,
}: ProductGridProps) {
  const listaExibicao = products.slice(0, limit);

  if (!listaExibicao || listaExibicao.length === 0) {
    return null;
  }

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
      <div className="flex flex-col items-center mb-10 text-center">
        <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm text-gray-500 font-light">
            {subtitle}
          </p>
        )}
        <div className="w-16 h-[3px] bg-[#C9A227] mt-4 rounded-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
        {listaExibicao.map((product) => (
          <div key={product.id} className="w-full flex justify-center">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}