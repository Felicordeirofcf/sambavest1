// Catálogo estático da Samba Vest.
//
// Como a loja ainda não está conectada a uma Nuvemshop real (veja lib/nuvemshop.ts
// para a integração opcional), a vitrine usa estes produtos fixos, montados a partir
// das artes que você já tem prontas. Para editar nome, preço, imagem ou tamanhos,
// basta mexer neste arquivo — nenhum outro componente precisa mudar.
//
// Quando você tiver uma loja Nuvemshop configurada (NEXT_PUBLIC_NUVEMSHOP_STORE_ID e
// NUVEMSHOP_ACCESS_TOKEN no .env.local) e quiser puxar produtos reais de lá, é só
// trocar as chamadas a getAllProducts()/getProductsByCategory()/getProductByHandle()
// nas páginas por lib/nuvemshop.ts -> getProducts().

export type ProductVariant = {
  id: number;
  size: string;
  stock: number | null;
};

export type Product = {
  id: number;
  name: string;
  price: number;
  originalPrice: number | null;
  image: string;
  images?: string[];
  handle: string;
  categories: string[];
  description: string;
  badge?: string;
  variants: ProductVariant[];
};

export type Category = {
  name: string;
  slug: string;
};

// Tamanhos padrão das camisas (conforme guia de tamanhos Samba Vest: P, M, G, GG, XGG, EXG)
const TAMANHOS_PADRAO = ['P', 'M', 'G', 'GG', 'XGG', 'EXG'];

function variantsFor(baseId: number): ProductVariant[] {
  return TAMANHOS_PADRAO.map((size, i) => ({
    id: baseId + i,
    size,
    stock: null, // null = sempre disponível (estoque sob encomenda)
  }));
}

export const categories: Category[] = [
  { name: 'Lançamentos', slug: 'lancamentos' },
  { name: 'Camisas de Enredo', slug: 'camisas-de-enredo' },
  { name: 'Campeãs do Carnaval', slug: 'campeas-do-carnaval' },
  { name: 'Kits Promocionais', slug: 'kits-promocionais' },
  { name: 'Tamanho Grande', slug: 'tamanho-grande' },
  { name: 'Acessórios', slug: 'acessorios' },
];

export const products: Product[] = [
  {
    id: 1,
    name: 'Beija-Flor 2027 — Zeneida, O Sopro do Pó de Louro',
    price: 149.9,
    originalPrice: null,
    image: '/products/beija-flor-2027-zeneida.webp',
    images: [
      '/products/beija-flor-2027-zeneida.webp',
      '/products/guia-tamanhos-beija-flor-2027.webp',
      '/products/pre-reserva-beija-flor-2027.webp',
    ],
    handle: 'beija-flor-2027-zeneida',
    categories: ['lancamentos', 'camisas-de-enredo', 'tamanho-grande'],
    badge: 'Lançamento',
    description:
      'Camisa oficial do enredo "Zeneida, O Sopro do Pó de Louro" do Beija-Flor de Nilópolis para o Carnaval 2027. Estampa exclusiva em poliéster leve, respirável e de secagem rápida — ideal para ensaios, festas e desfiles. Disponível do P ao EXG.',
    variants: variantsFor(1001),
  },
  {
    id: 2,
    name: 'Beija-Flor 2025 — Laíla de Todos os Santos, Laíla de Todos os Sambas',
    price: 99.9,
    originalPrice: 129.9,
    image: '/products/beija-flor-2025-laila.webp',
    handle: 'beija-flor-2025-laila',
    categories: ['camisas-de-enredo', 'campeas-do-carnaval', 'tamanho-grande'],
    badge: 'Campeã 2025',
    description:
      'Camisa em homenagem ao enredo campeão "Laíla de Todos os Santos, Laíla de Todos os Sambas" do Beija-Flor de Nilópolis. Estampa exclusiva e de alta qualidade, para quem quer vestir a história dessa conquista.',
    variants: variantsFor(2001),
  },
  {
    id: 3,
    name: 'Viradouro 2024 — Malunguinho, O Mensageiro de Três Mundos',
    price: 99.9,
    originalPrice: 129.9,
    image: '/products/viradouro-2024-malunguinho.webp',
    handle: 'viradouro-2024-malunguinho',
    categories: ['camisas-de-enredo', 'campeas-do-carnaval', 'tamanho-grande'],
    badge: 'Campeã 2024',
    description:
      'Camisa oficial do enredo campeão "Malunguinho, O Mensageiro de Três Mundos" da G.R.E.S. Unidos do Viradouro. Estampa vibrante em poliéster premium, feita para durar do ensaio técnico ao desfile.',
    variants: variantsFor(3001),
  },
  {
    id: 4,
    name: 'Kit 2 Camisas Campeãs — Beija-Flor + Viradouro',
    price: 149.9,
    originalPrice: 239.9,
    image: '/products/kit-campeas-promo.webp',
    images: [
      '/products/kit-campeas-promo.webp',
      '/products/beija-flor-2025-laila.webp',
      '/products/viradouro-2024-malunguinho.webp',
    ],
    handle: 'kit-2-camisas-campeas',
    categories: ['kits-promocionais', 'campeas-do-carnaval', 'tamanho-grande'],
    badge: 'Promoção',
    description:
      'Leve as duas últimas campeãs por um preço especial: a camisa "Laíla de Todos os Santos, Laíla de Todos os Sambas" (Beija-Flor 2025) e a camisa "Malunguinho, O Mensageiro de Três Mundos" (Viradouro 2024). Escolha o tamanho principal do kit — em caso de tamanhos diferentes entre as duas camisas, é só avisar pelo WhatsApp após o pedido.',
    variants: variantsFor(4001),
  },
];

export async function getAllProducts(): Promise<Product[]> {
  return products;
}

export async function getProductsByCategory(slug: string): Promise<Product[]> {
  if (!slug || slug === 'todos') return products;
  return products.filter((p) => p.categories.includes(slug));
}

export async function getProductByHandle(handle: string): Promise<Product | undefined> {
  const clean = decodeURIComponent(handle).toLowerCase().trim();
  return products.find(
    (p) => p.handle.toLowerCase() === clean || String(p.id) === clean
  );
}

export function getCategoryName(slug: string): string {
  const found = categories.find((c) => c.slug === slug);
  return found?.name || slug.replace(/-/g, ' ');
}
