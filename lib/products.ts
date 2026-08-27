// Catálogo estático da Samba Vest com suporte total ao layout dinâmico

export type ProductVariant = {
  id: number;
  parent_id?: number;
  model: string;
  size: string;
  price?: number;
  stock: number | null;
  image?: string;
};

export type Product = {
  id: number;
  name: string;
  price: number;
  regular_price?: number;
  originalPrice?: number | null;
  image: string;
  images: string[];
  handle: string;
  slug?: string;
  categories: string[];
  description: string;
  short_description?: string;
  badge?: string;
  variants: ProductVariant[];
};

export type Category = {
  name: string;
  slug: string;
};

// Tamanhos padrão das camisas (conforme guia de tamanhos Samba Vest)
const TAMANHOS_PADRAO = ['P', 'M', 'G', 'GG', 'XGG', 'EXG'];

function generateVariants(baseId: number, model: string, defaultImage: string, price: number): ProductVariant[] {
  return TAMANHOS_PADRAO.map((size, i) => ({
    id: baseId + i,
    parent_id: Math.floor(baseId / 1000),
    model,
    size,
    price,
    stock: null, // null = sempre disponível (sob encomenda)
    image: defaultImage,
  }));
}

// 1. CATEGORIAS ATUALIZADAS
export const categories: Category[] = [
  { name: 'Carnaval 2027', slug: 'carnaval-2027' },
  { name: 'Camisas de Escola de Samba', slug: 'camisas-de-escola-de-samba' },
  { name: 'Campeãs do Carnaval', slug: 'campeas-do-carnaval' }
];

// 2. PRODUTOS DO CATÁLOGO ESTÁTICO
export const products: Product[] = [
  {
    id: 5,
    name: 'Camisa Tradicional Zeneida - Beija-Flor 2027',
    price: 149.90,
    regular_price: 169.90,
    originalPrice: null,
    image: '/products/camisa1.png',
    images: [
      '/products/camisa1.png',
      '/products/tabela-tamanhos.jpg'
    ],
    handle: 'camisa-tradicional-zeneida-2027',
    slug: 'camisa-tradicional-zeneida-2027',
    categories: ['carnaval-2027', 'camisas-de-escola-de-samba'],
    badge: 'Lançamento',
    description: 'Camisa oficial do enredo Zeneida, O Sopro do Pó de Louro. Material premium 100% Poliéster, super leve e confortável para o carnaval.',
    variants: generateVariants(5001, 'Unissex', '/products/camisa1.png', 149.90),
  },
  {
    id: 6,
    name: 'Regata Zeneida - Beija-Flor 2027',
    price: 139.90,
    regular_price: 159.90,
    originalPrice: null,
    image: '/products/camisa2.png',
    images: [
      '/products/camisa2.png',
      '/products/tabela-tamanhos1.jpg'
    ],
    handle: 'regata-zeneida-2027',
    slug: 'regata-zeneida-2027',
    categories: ['carnaval-2027', 'camisas-de-escola-de-samba'],
    badge: 'Lançamento',
    description: 'Regata oficial do enredo Zeneida, O Sopro do Pó de Louro. Modelagem cavada, ideal para os dias mais quentes e para os ensaios de quadra.',
    variants: generateVariants(6001, 'Regata', '/products/camisa2.png', 139.90),
  },
  {
    id: 7,
    name: 'Baby Look Zeneida - Beija-Flor 2027',
    price: 149.90,
    regular_price: 169.90,
    originalPrice: null,
    image: '/products/camisa3.png',
    images: [
      '/products/camisa3.png',
      '/products/tabela-tamanhos2.jpg'
    ],
    handle: 'baby-look-zeneida-2027',
    slug: 'baby-look-zeneida-2027',
    categories: ['carnaval-2027', 'camisas-de-escola-de-samba'],
    badge: 'Lançamento',
    description: 'Baby Look oficial do enredo Zeneida. Modelagem mais acinturada e ajustada ao corpo. Material leve: 100% Poliéster.',
    variants: generateVariants(7001, 'Baby Look', '/products/camisa3.png', 149.90),
  },
  {
    id: 8,
    name: 'Vestido Zeneida - Beija-Flor 2027',
    price: 159.90,
    regular_price: 179.90,
    originalPrice: null,
    image: '/products/camisa4.png',
    images: [
      '/products/camisa4.png',
      '/products/tabela-tamanhos3.jpg'
    ],
    handle: 'vestido-zeneida-2027',
    slug: 'vestido-zeneida-2027',
    categories: ['carnaval-2027', 'camisas-de-escola-de-samba'],
    badge: 'Lançamento',
    description: 'Vestido estilo batinha oficial do enredo Zeneida. A junção perfeita entre a paixão pela escola e o estilo para pular o carnaval com muito conforto.',
    variants: generateVariants(8001, 'Vestido', '/products/camisa4.png', 159.90),
  }
];

// Funções de busca em memória
export async function getAllProducts(): Promise<Product[]> {
  return products;
}

export async function getProductsByCategory(slug: string): Promise<Product[]> {
  if (!slug || slug === 'todos') return products;
  const cleanSlug = slug.toLowerCase().trim();
  return products.filter((p) => p.categories.some((c) => c.toLowerCase() === cleanSlug));
}

export async function getProductByHandle(handle: string): Promise<Product | undefined> {
  const clean = decodeURIComponent(handle).toLowerCase().trim();
  return products.find(
    (p) => p.handle.toLowerCase() === clean || (p.slug && p.slug.toLowerCase() === clean) || String(p.id) === clean
  );
}

export function getCategoryName(slug: string): string {
  const found = categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
  return found?.name || slug.replace(/-/g, ' ');
}