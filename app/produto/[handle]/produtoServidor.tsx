import type { Metadata } from 'next';
import { podeOtimizar } from '../../../lib/imagem';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import ProdutoComModelo from './ProdutoComModelo';
import { BF, ofertaDoProduto } from '../../../lib/blackfriday';
import { faseBF } from '../../../lib/blackfridayPeriodo';

// Código compartilhado da página de produto: /produto/[handle] e /produto/[handle]/[modelo]
// (o endereço por modelo existe para a prévia do link no WhatsApp mostrar a foto do modelo certo).

/* eslint-disable @typescript-eslint/no-explicit-any */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sambavest.com').replace(/\/$/, '');

export function handleDe(bruto: string): string {
  return decodeURIComponent(bruto || '').trim().split('?')[0].split('&')[0];
}

/** Busca o produto pelo ID ou pelo slug exato (compartilhado entre a página e os metadados). */
export const buscarProduto = cache(async (handleOrId: string): Promise<any | null> => {
  const wcUrl = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;
  if (!handleOrId || !consumerKey || !consumerSecret) return null;
  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const opcoes = { headers: { Authorization: authHeader }, next: { revalidate: 120 } };

  let product: any = null;
  if (/^\d+$/.test(handleOrId)) {
    const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${handleOrId}`, opcoes);
    if (res.ok) product = await res.json();
    if (product && product.status !== 'publish') product = null;
  } else {
    const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?slug=${encodeURIComponent(handleOrId)}&status=publish`, opcoes);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) product = list[0];
    }
  }
  if (!product) return null;

  // Todas as variações (até 300), não só as 50 primeiras
  let variations: any[] = [];
  if (product.type === 'variable') {
    for (let pagina = 1; pagina <= 3; pagina++) {
      try {
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${product.id}/variations?per_page=100&page=${pagina}`, opcoes);
        if (!res.ok) break;
        const lote = await res.json();
        variations.push(...lote);
        if (lote.length < 100) break;
      } catch (err) {
        console.error('⚠️ Aviso: Falha ao carregar variações.', err);
        break;
      }
    }
    variations = variations.filter((v) => v.status === undefined || v.status === 'publish');
  }
  return { product, variations };
});

const semHtml = (t: string) => (t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Imagem da prévia do link (WhatsApp, Instagram...): a do modelo pedido em ?modelo= (Vestido, Baby look...)
 * e passada pelo otimizador de imagens do site (JPEG/PNG leve). O WhatsApp mostra borrada a foto pesada.
 */
function imagemPrevia(original: string | undefined): string | undefined {
  if (!original) return undefined;
  if (!podeOtimizar(original)) return original;
  const abs = original.startsWith('/') ? `${SITE}${original}` : original;
  return `${SITE}/_next/image?url=${encodeURIComponent(abs)}&w=640&q=75`; // q precisa estar em images.qualities (padrão: só 75)
}

/** "Baby Look" → "babylook"; "baby-look" → "babylook" (compara o modelo do endereço com o do Woo) */
export const chaveModelo = (t: string) => decodeURIComponent(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Nome do modelo para o endereço: "Baby Look" → "baby-look" */
export const slugModelo = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Nome real do modelo (como está no Woo) a partir do pedaço do endereço; null se não existir. */
export function modeloDoProduto(variations: any[], pedaco?: string): string | null {
  if (!pedaco) return null;
  const alvo = chaveModelo(pedaco);
  for (const v of variations) {
    const a = (v.attributes || []).find((x: any) => /modelo|style|model/i.test(x.name || ''));
    if (a?.option && chaveModelo(a.option) === alvo) return a.option;
  }
  return null;
}

// A página é estática (ISR): NÃO ler searchParams aqui (vira "dynamic server usage" e a página quebra).
// O modelo vem do CAMINHO (/produto/slug/vestido), que pode ser usado em página estática.
export async function metadadosProduto(handle: string, pedacoModelo?: string): Promise<Metadata> {
  const dados = await buscarProduto(handleDe(handle)).catch(() => null);
  if (!dados) return { title: 'Produto não encontrado | Samba Vest', robots: { index: false } };
  const { product, variations } = dados;
  const nomeModelo = modeloDoProduto(variations, pedacoModelo);
  const modelo = (nomeModelo || '').toLowerCase();
  const descricao = (semHtml(product.short_description) || semHtml(product.description)).slice(0, 160) ||
    `${product.name} — camisa de escola de samba da Samba Vest.`;
  // Foto da variação do modelo pedido; senão a 1ª foto do produto
  const doModelo = modelo
    ? (variations as { image?: { src?: string }; attributes?: { name?: string; option?: string }[] }[]).find(
        (v) => v.image?.src && v.attributes?.some((a) => /modelo|style|model/i.test(a.name || '') && (a.option || '').toLowerCase() === modelo)
      )?.image?.src
    : undefined;
  const imagem = imagemPrevia(doModelo || product.images?.[0]?.src);
  const url = `${SITE}/produto/${product.slug}`;
  const titulo = nomeModelo ? `${product.name} · ${nomeModelo}` : product.name;
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url: nomeModelo ? `${url}/${slugModelo(nomeModelo)}` : url,
      title: titulo,
      description: descricao,
      siteName: 'Samba Vest',
      locale: 'pt_BR',
      ...(imagem ? { images: [{ url: imagem, alt: product.name }] } : {}),
    },
    twitter: { card: 'summary_large_image', title: titulo, description: descricao, ...(imagem ? { images: [imagem] } : {}) },
  };
}

export async function PaginaProduto({ handle, pedacoModelo }: { handle: string; pedacoModelo?: string }) {
  const handleOrId = handleDe(handle);
  if (!handleOrId) notFound();

  let dados: Awaited<ReturnType<typeof buscarProduto>> = null;
  try {
    dados = await buscarProduto(handleOrId);
  } catch (error) {
    console.error('❌ Erro fatal ao carregar produto:', error);
  }
  if (!dados) notFound();
  const { product, variations } = dados;

  // Camisa da Black durante a campanha: tema escuro (igual à página da Black) e fotos na ordem certa
  const black = faseBF() === 'durante' ? await ofertaDoProduto(product).catch(() => null) : null;

  // Monta a galeria base de imagens
  const baseImages: string[] = product.images && product.images.length > 0 ? product.images.map((img: any) => img.src) : [];

  // Adiciona imagens das variações à galeria principal caso não estejam nela
  variations.forEach((v: any) => {
    const varImg = v.image?.src;
    if (varImg && !baseImages.includes(varImg)) baseImages.push(varImg);
  });

  const precoProduto = Number(product.price || product.regular_price || 0);

  // 4️⃣ Formatação do produto
  const productFormatado = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    type: product.type,
    price: precoProduto,
    regular_price: Number(product.regular_price || 0),
    description: product.description || '',
    short_description: product.short_description || '',
    images: (() => {
      if (!black) return baseImages.length > 0 ? baseImages : [''];
      // Frente da camisa primeiro (no WooCommerce a 1ª foto às vezes é a das costas), depois a vestida
      const frente = black.oferta.fotoFrenteLocal ? [black.oferta.imagemReserva] : [];
      const vestida = black.fotoVestida ? [black.fotoVestida] : [];
      const todas = [...new Set([...frente, ...vestida, ...baseImages])].filter(Boolean);
      return todas.length ? todas : [''];
    })(),
    image: baseImages[0] || '',
    categories: product.categories ? product.categories.map((cat: any) => cat.slug) : [],
    attributes: product.attributes
      ? product.attributes.map((attr: any) => ({ id: attr.id, name: attr.name, options: attr.options }))
      : [],
    variants:
      variations.length > 0
        ? variations.map((v: any) => {
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
              parent_id: product.id,
              model: modeloAttr?.option || 'Unissex',
              size: tamanhoAttr?.option || 'Único',
              price: Number(v.price || product.price || 0),
              regular_price: Number(v.regular_price || 0),
              stock: v.stock_quantity ?? (v.stock_status === 'instock' ? 10 : 0),
              stock_status: v.stock_status || 'instock',
              image: v.image?.src || '',
              attributes: v.attributes ? v.attributes.map((attr: any) => ({ name: attr.name, option: attr.option })) : [],
            };
          })
        : [
            {
              id: product.id,
              model: 'Unissex',
              size: 'Único',
              stock: product.stock_quantity ?? 10,
              stock_status: product.stock_status || 'instock',
              price: precoProduto,
              regular_price: Number(product.regular_price || 0),
              image: baseImages[0] || '',
            },
          ],
  };

  // Dados estruturados (Google Shopping / rich results)
  const precos = productFormatado.variants.map((v: any) => Number(v.price)).filter((n: number) => n > 0);
  const emEstoque = productFormatado.variants.some((v: any) => v.stock_status !== 'outofstock');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: baseImages.slice(0, 5),
    description: semHtml(product.short_description || product.description).slice(0, 500),
    sku: product.sku || String(product.id),
    brand: { '@type': 'Brand', name: 'Samba Vest' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'BRL',
      lowPrice: precos.length ? Math.min(...precos).toFixed(2) : undefined,
      highPrice: precos.length ? Math.max(...precos).toFixed(2) : undefined,
      offerCount: productFormatado.variants.length,
      availability: emEstoque ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE}/produto/${product.slug}`,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ProdutoComModelo
        product={productFormatado}
        modeloFixo={modeloDoProduto(variations, pedacoModelo)}
        black={black ? { fim: BF.fim.toISOString(), escola: black.oferta.escola, enredo: black.oferta.enredo } : undefined}
      />
    </>
  );
}
