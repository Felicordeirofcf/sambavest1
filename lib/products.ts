// Catálogo estático da Samba Vest.

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

// 1. CATEGORIAS ATUALIZADAS ("Todos os produtos" já é nativo da URL /categoria/todos)
export const categories: Category[] = [
  { name: 'Carnaval 2027', slug: 'carnaval-2027' },
  { name: 'Camisas de Escola de Samba', slug: 'camisas-de-escola-de-samba' },
  { name: 'Campeãs do Carnaval', slug: 'campeas-do-carnaval' }
];

// 2. PRODUTOS (Apenas as 4 camisas novas, agora apontando para carnaval-2027)
export const products: Product[] = [
  {
    id: 5,
    name: 'Camisa Tradicional Zeneida - Beija-Flor 2027',
    price: 149.90, 
    originalPrice: null,
    image: '/products/camisa1.png',
    images: [
      '/products/camisa1.png',
      '/products/tabela-tamanhos.jpg'
    ],
    handle: 'camisa-tradicional-zeneida-2027',
    categories: ['carnaval-2027'], // 🚀 Atualizado
    badge: 'Lançamento',
    description: 'Camisa oficial do enredo Zeneida, O Sopro do Pó de Louro. Material premium 100% Poliéster, super leve e confortável para o carnaval.',
    variants: variantsFor(5001),
  },
  {
    id: 6,
    name: 'Regata Zeneida - Beija-Flor 2027',
    price: 139.90,
    originalPrice: null,
    image: '/products/camisa2.png',
    images: [
      '/products/camisa2.png',
      '/products/tabela-tamanhos1.jpg'
    ],
    handle: 'regata-zeneida-2027',
    categories: ['carnaval-2027'], // 🚀 Atualizado
    badge: 'Lançamento',
    description: 'Regata oficial do enredo Zeneida, O Sopro do Pó de Louro. Modelagem cavada, ideal para os dias mais quentes e para os ensaios de quadra.',
    variants: variantsFor(6001),
  },
  {
    id: 7,
    name: 'Baby Look Zeneida - Beija-Flor 2027',
    price: 149.90,
    originalPrice: null,
    image: '/products/camisa3.png',
    images: [
      '/products/camisa3.png',
      '/products/tabela-tamanhos2.jpg'
    ],
    handle: 'baby-look-zeneida-2027',
    categories: ['carnaval-2027'], // 🚀 Atualizado
    badge: 'Lançamento',
    description: 'Baby Look oficial do enredo Zeneida. Modelagem mais acinturada e ajustada ao corpo. Material leve: 100% Poliéster.',
    variants: variantsFor(7001),
  },
  {
    id: 8,
    name: 'Vestido Zeneida - Beija-Flor 2027',
    price: 159.90,
    originalPrice: null,
    image: '/products/camisa4.png',
    images: [
      '/products/camisa4.png',
      '/products/tabela-tamanhos3.jpg'
    ],
    handle: 'vestido-zeneida-2027',
    categories: ['carnaval-2027'], // 🚀 Atualizado
    badge: 'Lançamento',
    description: 'Vestido estilo batinha oficial do enredo Zeneida. A junção perfeita entre a paixão pela escola e o estilo para pular o carnaval com muito conforto.',
    variants: variantsFor(8001),
  }
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