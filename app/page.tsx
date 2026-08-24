// app/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import ProductCard from '../components/product/ProductCard';
import { getProdutosBlingMapeados } from '../lib/bling';
import HeroCarousel from '../components/home/HeroCarousel';
import AboutAtelie from '../components/home/AboutAtelie';

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
  const products = await getProdutosBlingMapeados();
  const lancamentos = products.filter((p) => p.categories.includes('lancamentos'));

  return (
    <>
      {/* 🚀 O TRUQUE MÁGICO DAS ANIMAÇÕES EM CASCATA */}
      <style>{`
        @keyframes revealUp {
          0% { opacity: 0; transform: translateY(40px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-reveal {
          opacity: 0;
          animation: revealUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <div className="w-full bg-[#F9F9F9]">
        
        {/* Hero sem atraso para carregar instantaneamente */}
        <div className="animate-reveal" style={{ animationDelay: '0s' }}>
          <HeroCarousel />
        </div>

        {/* Banners de Categorias */}
        <section className="w-full max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
            {featuredCategories.map((cat, index) => (
              <Link
                key={cat.slug}
                href={`/categoria/${cat.slug}`}
                className="animate-reveal group relative flex aspect-[16/7] w-full items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-500 hover:shadow-xl hover:border-[#C9A227]/50 md:aspect-[21/9]"
                style={{ animationDelay: `${0.2 + (index * 0.15)}s` }}
              >
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain p-4 transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B34]/90 via-[#0B1B34]/30 to-transparent transition-opacity duration-500 group-hover:opacity-100" />
                <span className="relative z-10 px-4 pb-4 pt-12 text-center font-heading text-xl font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-b from-[#F0DFA8] via-[#C9A227] to-[#8A6D1C] drop-shadow-[0_4px_6px_rgba(0,0,0,0.9)] transition-transform duration-500 group-hover:scale-105 md:text-3xl">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Seção de Produtos (Lançamentos) */}
        <section className="w-full max-w-[1600px] mx-auto px-4 pb-24 pt-4">
          {/* Título da seção animado */}
          <div className="animate-reveal mb-14 text-center" style={{ animationDelay: '0.4s' }}>
            <h2 className="font-heading text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] md:text-4xl">
              Lançamentos
            </h2>
            <div className="mx-auto mt-5 h-[3px] w-20 bg-[#C9A227] rounded-full" />
          </div>

          {lancamentos.length === 0 ? (
            <p className="animate-reveal text-center italic text-gray-500" style={{ animationDelay: '0.5s' }}>
              Nenhum produto cadastrado no momento.
            </p>
          ) : (
            // 🚀 MUDANÇA AQUI: gap-6 e 3 colunas em telas muito grandes (lg:grid-cols-3) para melhor distribuição do max-w-1600px
            <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-8">
              {lancamentos.map((product, index) => (
                <div 
                  key={product.id} 
                  className="animate-reveal w-full"
                  style={{ animationDelay: `${0.5 + (index * 0.15)}s` }}
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          )}

          {/* Botão animado */}
          <div className="animate-reveal mt-20 flex w-full justify-center" style={{ animationDelay: '1.2s' }}>
            <Link
              href="/categoria/todos"
              className="group relative flex items-center justify-center gap-3 overflow-hidden rounded-full bg-[#C9A227] px-12 py-4 font-heading text-sm font-extrabold uppercase tracking-widest text-[#0B1B34] shadow-[0_5px_15px_rgba(201,162,39,0.3)] transition-all duration-300 hover:scale-105 hover:bg-[#0B1B34] hover:text-[#C9A227] hover:shadow-[0_8px_25px_rgba(11,27,52,0.5)]"
            >
              VER TODA A COLEÇÃO
              <svg className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </section>

        <AboutAtelie />
      </div>
    </>
  );
}