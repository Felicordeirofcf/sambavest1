import Link from 'next/link';
import Image from 'next/image';
import ProductCard from '../components/product/ProductCard';
import { getAllProducts } from '../lib/products';
import HeroCarousel from '../components/home/HeroCarousel';
import AboutAtelie from '../components/home/AboutAtelie';
import { FREE_SHIPPING_THRESHOLD } from '../lib/shipping';

// Categorias em destaque exibidas como banners retangulares na home.
const featuredCategories = [
  {
    name: 'Lançamentos',
    slug: 'lancamentos',
    image: '/products/beija-flor-2027-zeneida.webp',
  },
  {
    name: 'Campeãs do Carnaval',
    slug: 'campeas-do-carnaval',
    image: '/products/beija-flor-2025-laila.webp',
  },
];

export default async function HomePage() {
  const products = await getAllProducts();
  const lancamentos = products.filter((p) => p.categories.includes('lancamentos'));

  return (
    <div className="w-full bg-[#F9F9F9]">
      {/* Carrossel Principal */}
      <HeroCarousel />

      {/* Categorias em Destaque */}
      <section className="w-full px-2 md:px-4 py-6 md:py-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {featuredCategories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categoria/${cat.slug}`}
              className="group relative flex aspect-[16/7] w-full items-center justify-center overflow-hidden border-[2px] border-[#0B1B34] bg-white shadow-sm md:aspect-[21/9]"
            >
              <Image
                src={cat.image}
                alt={cat.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain p-4 transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B34] via-[#0B1B34]/40 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
              <span className="relative z-10 px-4 pb-4 pt-12 text-center font-heading text-xl md:text-3xl font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-b from-[#F0DFA8] via-[#C9A227] to-[#8A6D1C] drop-shadow-[0_4px_6px_rgba(0,0,0,0.9)] transition-transform duration-500 group-hover:scale-105">
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
          /* AQUI ESTÁ A MUDANÇA PRINCIPAL: grid-cols adaptável para celular, tablet e desktop */
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 w-full">
            {lancamentos.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        <div className="mt-16 flex w-full justify-center">
          <Link
            href="/categoria/todos"
            className="group relative flex items-center justify-center gap-3 overflow-hidden bg-[#C9A227] px-10 py-4 font-heading text-sm font-extrabold uppercase tracking-widest text-[#0B1B34] shadow-[0_5px_15px_rgba(201,162,39,0.4)] transition-all duration-300 hover:scale-105 hover:bg-[#0B1B34] hover:text-[#C9A227] hover:shadow-[0_8px_25px_rgba(11,27,52,0.4)]"
          >
            VER TODA A COLEÇÃO
            <svg
              className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>

      <AboutAtelie />
    </div>
  );
}