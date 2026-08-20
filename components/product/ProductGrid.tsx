'use client';

import ProductCard from './ProductCard';
import { products } from '../../lib/products';

// Grade de destaque opcional (não usada nas páginas por padrão — a Home e as páginas
// de categoria já buscam de lib/products.ts). Mantida aqui caso queira montar uma
// seção "Mais Vendidas" separada em algum lugar do site.
export default function ProductGrid() {
  const maisVendidas = products.slice(0, 4);

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex flex-col items-center mb-10">
        <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34]">
          Mais Vendidas ☆
        </h2>
        <div className="w-16 h-[3px] bg-[#C9A227] mt-6"></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-8">
        {maisVendidas.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
