export const revalidate = 60; // 🚀 Cache inteligente de 1 minuto: navegação instantânea nas categorias!

import Link from 'next/link';
import ProductCard from '../../../components/product/ProductCard';

// 🛍️ Função para buscar e sincronizar os produtos do WooCommerce por categoria com cache otimizado
async function getProdutosWooCommercePorCategoria(categorySlug: string) {
  try {
    const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://sambavest.com';
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      console.error('❌ Credenciais do WooCommerce não configuradas.');
      return [];
    }

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const resProducts = await fetch(`${wcUrl}/wp-json/wc/v3/products?status=publish&per_page=50`, {
      headers: { 'Authorization': authHeader },
      next: { revalidate: 60 }, // 🚀 Resposta ultra rápida controlada por cache
    });

    if (!resProducts.ok) return [];

    const products = await resProducts.json();
    const listaExibicao: any[] = [];

    for (const prod of products) {
      const precoBase = Number(prod.price || prod.regular_price || prod.sale_price || 149.90);
      
      // 1. Extração segura da imagem principal corrigida
      const imagemPrincipal = prod.images?.[0]?.src || '';
      
      // 2. Extraímos as imagens normais da galeria
      const productImages = prod.images ? prod.images.map((img: any) => img.src) : [];

      // 🎯 3. INJEÇÃO DA FOTO DAS COSTAS (BEIJA-FLOR 2027)
      if (prod.slug && prod.slug.includes('beija-flor-2027') && productImages.length === 1) {
        productImages.push('https://sambavest.com/wp-content/uploads/2026/08/camisa_enredo_atual_2_.webp');
      }

      let variationsList = [];

      if (prod.type === 'variable') {
        try {
          const resVar = await fetch(`${wcUrl}/wp-json/wc/v3/products/${prod.id}/variations?per_page=50`, {
            headers: { 'Authorization': authHeader },
            next: { revalidate: 60 },
          });
          if (resVar.ok) {
            variationsList = await resVar.json();
          }
        } catch (e) {
          console.error(`Erro ao buscar variações do produto ${prod.id}:`, e);
        }
      }

      listaExibicao.push({
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        price: precoBase,
        regular_price: Number(prod.regular_price || precoBase),
        images: productImages.length > 0 ? productImages : [imagemPrincipal],
        categories: prod.categories.map((cat: any) => cat.slug),
        badge: prod.attributes?.find((a: any) => a.name.toLowerCase().includes('badge'))?.options?.[0] || (prod.on_sale ? 'Promoção' : null),
        variants: variationsList.length > 0 ? variationsList.map((v: any) => {
          const modeloAttr = v.attributes?.find((a: any) => {
            const nome = (a.name || '').toLowerCase();
            return nome.includes('modelo') || nome.includes('style') || nome.includes('model');
          });
          const tamanhoAttr = v.attributes?.find((a: any) => {
            const nome = (a.name || '').toLowerCase();
            return nome.includes('tamanho') || nome.includes('size');
          });

          return {
            id: v.id,
            parent_id: prod.id,
            model: modeloAttr?.option || 'Geral',
            size: tamanhoAttr?.option || 'Único',
            price: Number(v.price || precoBase),
            stock: v.stock_quantity ?? (v.stock_status === 'instock' ? 10 : 0),
            image: v.image?.src || imagemPrincipal
          };
        }) : [
          { id: prod.id, model: 'Unissex', size: 'Único', stock: 10, price: precoBase, image: imagemPrincipal }
        ]
      });
    }

    // Se não for 'todos', filtra pelo slug da categoria do WooCommerce
    if (categorySlug && categorySlug !== 'todos') {
      return listaExibicao.filter((p: any) => p.categories.includes(categorySlug));
    }

    return listaExibicao;

  } catch (error) {
    console.error('❌ Erro ao carregar produtos da categoria:', error);
    return [];
  }
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const resolvedParams = await Promise.resolve(params);
  const categorySlug = resolvedParams.slug || 'todos';
  
  const realProducts = await getProdutosWooCommercePorCategoria(categorySlug);
  
  // 🚀 Correção de português para os títulos
  const titleMap: Record<string, string> = {
    'todos': 'Todos os Produtos',
    'carnaval-2027': 'Carnaval 2027',
    'campeas-do-carnaval': 'Campeãs do Carnaval',
    'camisas-de-escola-de-samba': 'Camisas de Escola de Samba'
  };
  const categoryTitle = titleMap[categorySlug] 
    ? titleMap[categorySlug].toUpperCase() 
    : categorySlug.replace(/-/g, ' ').toUpperCase();

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
        {/* Filtros Lateral (Sidebar) com todas as coleções atualizadas */}
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
              <Link
                href="/categoria/carnaval-2027"
                className={`text-xs uppercase tracking-widest transition-colors ${categorySlug === 'carnaval-2027' ? 'font-bold text-[#0B1B34]' : 'text-gray-500 hover:text-[#0B1B34]'}`}
              >
                Carnaval 2027
              </Link>
              <Link
                href="/categoria/camisas-de-escola-de-samba"
                className={`text-xs uppercase tracking-widest transition-colors ${categorySlug === 'camisas-de-escola-de-samba' ? 'font-bold text-[#0B1B34]' : 'text-gray-500 hover:text-[#0B1B34]'}`}
              >
                Camisas de Escola de Samba
              </Link>
              <Link
                href="/categoria/campeas-do-carnaval"
                className={`text-xs uppercase tracking-widest transition-colors ${categorySlug === 'campeas-do-carnaval' ? 'font-bold text-[#0B1B34]' : 'text-gray-500 hover:text-[#0B1B34]'}`}
              >
                Campeãs do Carnaval
              </Link>
            </div>
          </div>
        </aside>

        {/* Grid de produtos */}
        <div className="w-full md:w-3/4">
          {realProducts.length === 0 ? (
            <div className="text-center py-20 text-[#1E2233] flex flex-col items-center justify-center border border-[#E5E5E5] bg-white">
              <p className="uppercase tracking-widest text-sm mb-4 font-semibold">
                Nenhuma peça nesta categoria.
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