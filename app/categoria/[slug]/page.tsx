import Link from 'next/link';
import ProductCard from '../../../components/product/ProductCard';
import { getProductsByCategory, categories, getCategoryName } from '../../../lib/products';

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const resolvedParams = await Promise.resolve(params);
  const categorySlug = resolvedParams.slug || 'todos';
  const categoryTitle = categorySlug === 'todos' ? 'Todos os Produtos' : getCategoryName(categorySlug);

  const realProducts = await getProductsByCategory(categorySlug);

  return (
    <div className="w-full min-h-screen bg-[#FAF7EF] pt-0 pb-20">
      {/* Cabeçalho da Categoria */}
      <div className="w-full bg-white py-12 md:py-16 mb-10 flex flex-col items-center justify-center border-b border-[#E5E5E5]">
        <h1 className="font-heading text-3xl md:text-4xl font-extrabold uppercase tracking-widest text-[#0B1B34] text-center px-4">
          {categoryTitle}
        </h1>
        <div className="w-12 h-[3px] bg-[#C9A227] mt-6 mb-4"></div>
        <p className="text-[#1E2233] text-[10px] md:text-xs tracking-[0.2em] uppercase">
          {realProducts.length} {realProducts.length === 1 ? 'Peça Disponível' : 'Peças Disponíveis'}
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row gap-10">
        {/* Filtros Lateral (Sidebar) */}
        <aside className="hidden md:flex w-1/4 flex-col gap-8">
          <div className="border-b border-[#E5E5E5] pb-6 sticky top-24">
            <h3 className="text-sm uppercase tracking-[0.15em] text-[#0B1B34] mb-6 border-b border-[#0B1B34] pb-2 inline-block font-bold">
              Coleções
            </h3>
            <div className="flex flex-col gap-4">
              <Link
                href="/categoria/todos"
                className={`text-xs uppercase tracking-widest transition-colors ${categorySlug === 'todos' ? 'font-bold text-[#0B1B34]' : 'text-gray-500 hover:text-[#0B1B34]'}`}
              >
                Todos os Produtos
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/categoria/${cat.slug}`}
                  className={`text-xs uppercase tracking-widest transition-colors ${categorySlug === cat.slug ? 'font-bold text-[#0B1B34]' : 'text-gray-500 hover:text-[#0B1B34]'}`}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Grid de produtos */}
        <div className="w-full md:w-3/4">
          {realProducts.length === 0 ? (
            <div className="text-center py-20 text-[#1E2233] flex flex-col items-center justify-center border border-[#E5E5E5] bg-white">
              <p className="uppercase tracking-widest text-sm mb-4 font-semibold">
                {categorySlug === 'acessorios'
                  ? 'Novidades em breve nesta categoria.'
                  : 'Nenhuma peça nesta categoria.'}
              </p>
              <Link href="/categoria/todos" className="text-xs uppercase tracking-widest border-b border-[#0B1B34] pb-1 hover:text-[#C9A227] hover:border-[#C9A227] transition-colors">
                Ver Coleção Completa
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-2 md:gap-x-4 gap-y-10">
              {realProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
