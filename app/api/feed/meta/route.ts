// Catálogo de produtos para o Meta (Facebook/Instagram) no formato CSV.
// No Gerenciador de Comércio: Catálogo → Fontes de dados → Feed de dados → URL agendada:
//   https://SEU-SITE/api/feed/meta
// Cada variação (modelo + tamanho) vira um item; o produto pai é o item_group_id.
// Os IDs batem com os eventos do Pixel e da API de Conversões.
import { config, integracoes } from '../../../../lib/automacao/config';
import { wc } from '../../../../lib/automacao/woocommerce';

// Dinâmico (não gera no build); o cache de 1h fica na CDN pelo Cache-Control.
export const dynamic = 'force-dynamic';

type Img = { src: string };
type Atributo = { name: string; option?: string; options?: string[] };
type ProdutoWc = {
  id: number;
  name: string;
  slug: string;
  type: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  description: string;
  short_description: string;
  images: Img[];
  categories: { name: string }[];
};
type VariacaoWc = {
  id: number;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  image: Img | null;
  attributes: Atributo[];
};

const COLUNAS = [
  'id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'link', 'image_link', 'additional_image_link', 'brand', 'size', 'style', 'product_type', 'google_product_category',
];

function texto(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
}

function csv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function preco(v: string): string {
  const n = Number(v);
  return n > 0 ? `${n.toFixed(2)} BRL` : '';
}

function atributo(attrs: Atributo[], ...nomes: string[]): string {
  const a = attrs.find((x) => nomes.some((n) => (x.name || '').toLowerCase().includes(n)));
  return a?.option || '';
}

export async function GET() {
  if (!integracoes.woo()) return new Response('WooCommerce não configurado', { status: 500 });

  const produtos: ProdutoWc[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const lote = await wc<ProdutoWc[]>(`/products?status=publish&per_page=100&page=${pagina}`);
    produtos.push(...lote);
    if (lote.length < 100) break;
  }

  const linhas: string[][] = [];
  for (const p of produtos) {
    const link = `${config.siteUrl}/produto/${p.slug || p.id}`;
    const descricao = texto(p.short_description) || texto(p.description) || p.name;
    const imagens = p.images.map((i) => i.src);
    const categoria = p.categories.map((c) => c.name).join(' > ');
    const base = {
      group: String(p.id),
      descricao,
      link,
      extras: imagens.slice(1, 10).join(','),
      categoria,
    };

    const variacoes = p.type === 'variable' ? await wc<VariacaoWc[]>(`/products/${p.id}/variations?per_page=100`) : [];

    if (variacoes.length === 0) {
      const promo = p.sale_price && Number(p.sale_price) < Number(p.regular_price);
      linhas.push([
        String(p.id), base.group, p.name, descricao, p.stock_status === 'outofstock' ? 'out of stock' : 'in stock', 'new',
        preco(p.regular_price || p.price), promo ? preco(p.sale_price) : '', link, imagens[0] || '', base.extras,
        config.lojaNome, '', '', categoria, 'Apparel & Accessories > Clothing',
      ]);
      continue;
    }

    for (const v of variacoes) {
      const tamanho = atributo(v.attributes, 'tamanho', 'size');
      const modelo = atributo(v.attributes, 'modelo', 'model', 'style');
      const titulo = [p.name, modelo, tamanho].filter(Boolean).join(' - ');
      const promo = v.sale_price && Number(v.sale_price) < Number(v.regular_price);
      linhas.push([
        String(v.id), base.group, titulo, descricao, v.stock_status === 'outofstock' ? 'out of stock' : 'in stock', 'new',
        preco(v.regular_price || v.price || p.price), promo ? preco(v.sale_price) : '', link,
        v.image?.src || imagens[0] || '', base.extras, config.lojaNome, tamanho, modelo, categoria,
        'Apparel & Accessories > Clothing',
      ]);
    }
  }

  const corpo = [COLUNAS.join(','), ...linhas.map((l) => l.map(csv).join(','))].join('\n');
  return new Response(corpo, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' },
  });
}
