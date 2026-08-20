// Integração opcional com a Nuvemshop. A vitrine hoje usa o catálogo estático em
// lib/products.ts, mas se você já tem (ou vier a ter) uma loja Nuvemshop, pode
// configurar as variáveis abaixo no .env.local e trocar as chamadas a
// lib/products.ts pelas funções deste arquivo nas páginas (Home, Categoria e Produto).
const STORE_ID = process.env.NEXT_PUBLIC_NUVEMSHOP_STORE_ID;
const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;
const USER_AGENT =
  process.env.NUVEMSHOP_USER_AGENT || 'SambaVestApp (contato@sambavest.com.br)';

const API_URL = `https://api.nuvemshop.com.br/v1/${STORE_ID}`;

type FetchOptions = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

async function fetchNuvemshop(endpoint: string, options: FetchOptions = {}) {
  if (!STORE_ID || !ACCESS_TOKEN) {
    throw new Error('Chaves da Nuvemshop não configuradas.');
  }

  const url = `${API_URL}${endpoint}`;

  const headers = {
    Authentication: `bearer ${ACCESS_TOKEN}`,
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const textoDoErroDaNuvemshop = await response.text();
    console.error(
      `ERRO NUVEMSHOP: Status ${response.status} -> ${textoDoErroDaNuvemshop}`
    );
    throw new Error(
      `A Nuvemshop recusou o pedido. Erro ${response.status}: ${textoDoErroDaNuvemshop}`
    );
  }

  return response.json();
}

export async function getProducts(q?: string) {
  const endpoint = q ? `/products?q=${encodeURIComponent(q)}` : '/products';

  try {
    const data = await fetchNuvemshop(endpoint, {
      next: { revalidate: 300 },
    });

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map((product: any) => {
      let safeHandle = String(product.id);

      if (product.handle) {
        if (typeof product.handle === 'string') safeHandle = product.handle;
        else if (product.handle.pt) safeHandle = product.handle.pt;
        else if (Object.values(product.handle)[0]) {
          safeHandle = String(Object.values(product.handle)[0]);
        }
      }

      return {
        id: product.id,
        name: product.name?.pt || product.name || 'Produto Sem Nome',
        price: parseFloat(product.variants?.[0]?.price || '0'),
        originalPrice: product.variants?.[0]?.compare_at_price
          ? parseFloat(product.variants[0].compare_at_price || '0')
          : null,
        image:
          product.images?.[0]?.src ||
          'https://via.placeholder.com/800x1000?text=Sem+Foto',
        handle: safeHandle.toLowerCase().trim(),
        categories:
          product.categories?.map((c: any) => c.handle?.pt || c.handle || '') ||
          [],
        variants:
          product.variants?.map((v: any) => ({
            id: Number(v.id),
            size: v.values?.[0]?.pt || v.values?.[0] || 'U',
            stock: v.stock,
          })) || [],
      };
    });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    return [];
  }
}

type CheckoutItem = {
  variant_id: number;
  quantity: number;
};

type CheckoutContact = {
  name?: string;
  lastName?: string;
  email?: string;
};

export async function createCheckout(
  items: CheckoutItem[],
  contact?: CheckoutContact
) {
  const payload = {
    contact_name: contact?.name?.trim() || 'Cliente',
    contact_lastname: contact?.lastName?.trim() || 'Online',
    contact_email:
      contact?.email?.trim() || `cliente-${Date.now()}@example.com`,
    payment_status: 'unpaid',
    products: items.map((item) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
    })),
  };

  const data = await fetchNuvemshop('/draft_orders', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });

  const checkoutUrl = data?.checkout_url || data?.abandoned_checkout_url;

  if (!checkoutUrl) {
    throw new Error('A Nuvemshop não retornou uma URL de checkout.');
  }

  return {
    checkoutUrl,
    raw: data,
  };
}