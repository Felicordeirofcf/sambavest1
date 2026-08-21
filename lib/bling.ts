// lib/bling.ts
import { Product } from './products';

// Mantém os tokens na memória do servidor
let accessToken = process.env.BLING_ACCESS_TOKEN;
let refreshToken = process.env.BLING_REFRESH_TOKEN;

// Função que pede a chave nova pro Bling
async function atualizarTokenBling() {
  console.log("🔄 Tentando atualizar o Token do Bling automaticamente...");
  
  if (!refreshToken) {
    console.error("❌ Erro: BLING_REFRESH_TOKEN não configurado.");
    return false;
  }

  const credentials = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');

  try {
    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'Accept': '1.0'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      console.error("❌ Falha ao atualizar o token. É necessário gerar um novo manualmente.");
      return false;
    }

    const data = await response.json();
    
    // Salva as chaves novas na memória para as próximas requisições
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    
    console.log("✅ Token do Bling renovado com sucesso nos bastidores!");
    return true;
  } catch (error) {
    console.error("❌ Erro no servidor ao atualizar token:", error);
    return false;
  }
}

// Função Real que bate na API do Bling
async function fetchRealBlingProducts(tentativa = 1): Promise<any[]> {
  if (!accessToken) {
    console.error("❌ Erro: Access Token não encontrado.");
    return [];
  }

  const response = await fetch('https://www.bling.com.br/Api/v3/produtos', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    },
    cache: 'no-store' 
  });

  // A MÁGICA ACONTECE AQUI: Se der 401 na primeira tentativa, ele renova e tenta de novo!
  if (response.status === 401 && tentativa === 1) {
    console.log("⚠️ Token expirado! Iniciando renovação...");
    const renovou = await atualizarTokenBling();
    
    if (renovou) {
      // Chama a si mesma novamente (agora como tentativa 2 para evitar loop infinito)
      return fetchRealBlingProducts(2);
    }
  }

  if (!response.ok) {
    console.error(`❌ Falha na API do Bling: ${response.status}`);
    return [];
  }

  const json = await response.json();
  return json.data || [];
}

export async function getProdutosBlingMapeados(): Promise<Product[]> {
  try {
    // Busca os produtos usando a função inteligente
    const produtosBlingRaw = await fetchRealBlingProducts();

    if (!produtosBlingRaw || produtosBlingRaw.length === 0) return [];

    return produtosBlingRaw.map((p: any) => {
      return {
        id: p.id,
        name: p.nome,
        price: parseFloat(p.preco),
        originalPrice: null, 
        
        image: '/products/camisa1.png', 
        images: ['/products/camisa1.png', '/products/tabela-tamanhos.jpg'],
        
        handle: p.id.toString(), 
        categories: ['lancamentos'], 
        description: p.descricaoCurta || 'Produto oficial Samba Vest.',
        badge: 'Novo', 
        
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