// lib/bling.ts
import { Product } from './products';

// Função Real que bate na API do Bling
async function fetchRealBlingProducts() {
  const token = process.env.BLING_ACCESS_TOKEN;

  if (!token) {
    console.error("❌ Erro: BLING_ACCESS_TOKEN não configurado no arquivo .env");
    return [];
  }

  const response = await fetch('https://www.bling.com.br/Api/v3/produtos', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    },
    cache: 'no-store' // Garante que o site sempre mostre o estoque exato do momento
  });

  if (!response.ok) {
    console.error(`Falha na API do Bling: ${response.status}`);
    return [];
  }

  const json = await response.json();
  return json.data || [];
}

export async function getProdutosBlingMapeados(): Promise<Product[]> {
  try {
    // Chamando a API real agora
    const produtosBlingRaw = await fetchRealBlingProducts();

    if (!produtosBlingRaw || produtosBlingRaw.length === 0) return [];

    return produtosBlingRaw.map((p: any) => {
      return {
        id: p.id,
        name: p.nome,
        price: parseFloat(p.preco),
        originalPrice: null, 
        
        // Imagem temporária até configurarmos o puxador de mídias do Bling
        image: '/products/camisa1.png', 
        images: ['/products/camisa1.png', '/products/tabela-tamanhos.jpg'],
        
        handle: p.id.toString(), 
        categories: ['lancamentos'], // Força aparecer na Home
        description: p.descricaoCurta || 'Produto oficial Samba Vest.',
        badge: 'Novo', // Selo limpo para produção
        
        // Estrutura de tamanhos genérica para a Home não quebrar (ajustaremos isso com os produtos pai/filho depois)
        variants: [
          { id: parseInt(`${p.id}1`), size: 'P', stock: null },
          { id: parseInt(`${p.id}2`), size: 'M', stock: null },
          { id: parseInt(`${p.id}3`), size: 'G', stock: null },
          { id: parseInt(`${p.id}4`), size: 'GG', stock: null },
        ]
      };
    });

  } catch (error) {
    console.error('❌ Falha na integração com Bling:', error);
    return []; 
  }
}