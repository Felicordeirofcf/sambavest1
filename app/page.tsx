import Link from 'next/link';
import ProductCard from '../components/product/ProductCard';
import { getAllProducts, categories } from '../lib/products';
import HeroCarousel from '../components/home/HeroCarousel';
import AboutAtelie from '../components/home/AboutAtelie';
import { FREE_SHIPPING_THRESHOLD } from '../lib/shipping';

export default async function HomePage() {
  const products = await getAllProducts();
  const lancamentos = products.slice(0, 4);

  return (
    <div className="w-full bg-white">
      {/* Barra de Frete Grátis */}
      <div className="w-full bg-[#0B1B34] py-2 md:py-2.5 flex justify-center items-center">
        <p className="text-[8px] md:text-[10px] lg:text-xs font-sans tracking-[0.15em] uppercase text-[#C9A227] font-medium text-center px-2 md:px-4">
           • FRETE GRÁTIS EM COMPRAS ACIMA DE R$ {FREE_SHIPPING_THRESHOLD.toFixed(2).replace('.', ',')} •
        </p>
      </div>

      {/* Carrossel Principal */}
      <HeroCarousel />

      {/* Grade de Categorias */}
      <section className="w-full px-2 md:px-4 py-6 md:py-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categoria/${cat.slug}`}
              className="aspect-square border-[2px] border-[#0B1B34] flex items-center justify-center p-1 md:p-2 text-center transition-colors hover:bg-[#F0DFA8]/40 bg-white shadow-sm"
            >
              <span className="font-heading text-[8px] md:text-[10px] lg:text-xs uppercase tracking-widest text-[#0B1B34] whitespace-pre-line leading-relaxed">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Vitrine de Lançamentos */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4">
        <div className="text-center mb-12">
          <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34]">
            Lançamentos
          </h2>
          <div className="mx-auto mt-4 h-[3px] w-16 bg-[#C9A227]" />
        </div>

        {lancamentos.length === 0 ? (
          <p className="text-center text-gray-500 italic">
            Nenhum produto encontrado. Cadastre itens em lib/products.ts.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
            {lancamentos.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        <div className="mt-16 flex w-full justify-center">
          <Link
            href="/categoria/todos"
            className="border-b border-[#0B1B34] pb-1 text-xs md:text-sm font-bold uppercase tracking-widest text-[#0B1B34] transition-colors hover:border-[#C9A227] hover:text-[#C9A227]"
          >
            Ver Toda a Coleção
          </Link>
        </div>
      </section>

      <AboutAtelie />
    </div>
  );
}
