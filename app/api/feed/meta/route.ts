// Catálogo de produtos para a Meta (Facebook/Instagram) no formato CSV, direto do WooCommerce.
// No Gerenciador de Comércio: Catálogo → Fontes de dados → Feed de dados → URL agendada:
//   https://SEU-SITE/api/feed/meta   (a cada 1 hora)
// Cada variação (modelo + tamanho) vira um item; o produto pai é o item_group_id.
// Os IDs batem com os eventos do Pixel e da API de Conversões (variação = content_id, pai = grupo).
import { config, integracoes } from '../../../../lib/automacao/config';
import { wc } from '../../../../lib/automacao/woocommerce';
import { faseBF } from '../../../../lib/blackfridayPeriodo';
import { mapaLimitado } from '../../../../lib/limite';

// Dinâmico (não gera no build); o cache de 1h fica na CDN pelo Cache-Control.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Img = { src: string };
type Atributo = { name: string; option?: string; options?: string[] };
type ProdutoWc = {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  catalog_visibility?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from_gmt?: string | null;
  date_on_sale_to_gmt?: string | null;
  stock_status: string;
  description: string;
  short_description: string;
  images: Img[];
  categories: { name: string }[];
};
type VariacaoWc = {
  id: number;
  status?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from_gmt?: string | null;
  date_on_sale_to_gmt?: string | null;
  stock_status: string;
  image: Img | null;
  attributes: Atributo[];
};

const COLUNAS = [
  'id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'sale_price_effective_date', 'link', 'image_link', 'additional_image_link', 'brand', 'size', 'style',
  'gender', 'age_group', 'product_type', 'google_product_category', 'custom_label_0',
];

function texto(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 5000);
}

function csv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const num = (v: string) => Number(v) || 0;
const preco = (n: number) => (n > 0 ? `${n.toFixed(2)} BRL` : '');

function atributo(attrs: Atributo[], ...nomes: string[]): string {
  const a = attrs.find((x) => nomes.some((n) => (x.name || '').toLowerCase().includes(n)));
  return a?.option || '';
}

/** Gênero a partir do modelo (a Meta exige para roupas). */
function genero(modelo: string, nome: string): string {
  const t = `${modelo} ${nome}`.toLowerCase();
  if (/feminin|baby ?look|vestido/.test(t)) return 'female';
  if (/masculin/.test(t)) return 'male';
  return 'unisex';
}

const disponibilidade = (s: string) => (s === 'outofstock' ? 'out of stock' : s === 'onbackorder' ? 'available for order' : 'in stock');

/** Período da promoção no formato da Meta (ISO 8601 "início/fim"), se o WooCommerce tiver datas. */
function periodoPromo(de?: string | null, ate?: string | null): string {
  if (!de && !ate) return '';
  const iso = (s: string) => `${s.replace(/Z?$/, '')}+00:00`;
  return `${de ? iso(de) : '2000-01-01T00:00:00+00:00'}/${ate ? iso(ate) : '2100-01-01T00:00:00+00:00'}`;
}

export async function GET() {
  if (!integracoes.woo()) return new Response('WooCommerce não configurado', { status: 500 });

  const produtos: ProdutoWc[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const lote = await wc<ProdutoWc[]>(`/products?status=publish&per_page=100&page=${pagina}`);
    produtos.push(...lote);
    if (lote.length < 100) break;
  }
  const visiveis = produtos.filter((p) => p.status === 'publish' && p.catalog_visibility !== 'hidden');

  // Camisas da Black Friday ganham a etiqueta "black_friday" (para um conjunto de produtos só delas)
  let idsBlack = new Set<number>();
  if (faseBF() !== 'depois') {
    try {
      const { produtosBF } = await import('../../../../lib/blackfriday');
      idsBlack = new Set((await produtosBF()).map((p) => p.wooId).filter((x): x is number => Boolean(x)));
    } catch {
      // sem etiqueta
    }
  }

  // Variações buscadas no máximo 4 produtos por vez (o WooCommerce derruba conexões em rajada)
  const variacoesPorProduto = await mapaLimitado(visiveis, 4, (p) =>
    p.type === 'variable' ? wc<VariacaoWc[]>(`/products/${p.id}/variations?per_page=100`).catch(() => [] as VariacaoWc[]) : Promise.resolve([] as VariacaoWc[])
  );

  const site = config.siteUrl.replace(/\/$/, '');
  const linhas: string[][] = [];
  visiveis.forEach((p, i) => {
    const link = `${site}/produto/${p.slug || p.id}`;
    const descricao = texto(p.short_description) || texto(p.description) || p.name;
    const imagens = p.images.map((im) => im.src).filter((s) => /^https:\/\//.test(s));
    const categoria = p.categories.map((c) => c.name).join(' > ');
    const extras = imagens.slice(1, 10).join(',');
    const naBlack = idsBlack.has(p.id);
    const variacoes = variacoesPorProduto[i];

    if (p.type !== 'variable' || variacoes.length === 0) {
      const cheio = num(p.regular_price) || num(p.price);
      const promo = num(p.sale_price) > 0 && num(p.sale_price) < cheio;
      if (!(cheio > 0) || !imagens[0]) return; // a Meta rejeita item sem preço ou sem foto
      linhas.push([
        String(p.id), String(p.id), p.name.slice(0, 150), descricao, disponibilidade(p.stock_status), 'new',
        preco(cheio), promo ? preco(num(p.sale_price)) : '', promo ? periodoPromo(p.date_on_sale_from_gmt, p.date_on_sale_to_gmt) : '',
        link, imagens[0], extras, config.lojaNome, '', '', genero('', p.name), 'adult', categoria,
        'Apparel & Accessories > Clothing', naBlack && promo ? 'black_friday' : '',
      ]);
      return;
    }

    for (const v of variacoes) {
      if (v.status && v.status !== 'publish') continue;
      const cheio = num(v.regular_price) || num(v.price);
      const imagem = v.image?.src && /^https:\/\//.test(v.image.src) ? v.image.src : imagens[0];
      if (!(cheio > 0) || !imagem) continue;
      const tamanho = atributo(v.attributes, 'tamanho', 'size');
      const modelo = atributo(v.attributes, 'modelo', 'model', 'style');
      const titulo = [p.name, modelo, tamanho].filter(Boolean).join(' - ').slice(0, 150);
      const promo = num(v.sale_price) > 0 && num(v.sale_price) < cheio;
      // O link já abre a página no modelo da variação
      const linkVar = modelo ? `${link}?modelo=${encodeURIComponent(modelo)}` : link;
      linhas.push([
        String(v.id), String(p.id), titulo, descricao, disponibilidade(v.stock_status), 'new',
        preco(cheio), promo ? preco(num(v.sale_price)) : '', promo ? periodoPromo(v.date_on_sale_from_gmt, v.date_on_sale_to_gmt) : '',
        linkVar, imagem, extras, config.lojaNome, tamanho, modelo, genero(modelo, p.name), 'adult', categoria,
        // Só o que está de fato em promoção na Black (ex.: a Regata no mesmo produto fica de fora)
        'Apparel & Accessories > Clothing', naBlack && promo ? 'black_friday' : '',
      ]);
    }
  });

  const corpo = [COLUNAS.join(','), ...linhas.map((l) => l.map(csv).join(','))].join('\n');
  return new Response(corpo, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' },
  });
}
