// lib/bling.ts
import { Product } from './products';

// Função para obter um token válido a cada chamada, garantindo que o Vercel não sofra com escopo global perdido
async function getValidAccessToken(): Promise<string | null> {
  let accessToken = process.env.BLING_ACCESS_TOKEN;
  const refreshToken = process.env.BLING_REFRESH_TOKEN;
  const clientId = process.env.BLING_CLIENT_ID;
  const clientSecret = process.env.BLING_CLIENT_SECRET;

  if (!accessToken || !refreshToken || !clientId || !clientSecret) {
    console.error("❌ Faltam variáveis de ambiente do Bling configuradas no Vercel!");
    return null;
  }

  return accessToken;
}

async function atualizarTokenBling(): Promise<string | null> {
  console.log("🔄 Tentando atualizar o Token do Bling automaticamente...");
  const refreshToken = process.env.BLING_REFRESH_TOKEN;
  const clientId = process.env.BLING_CLIENT_ID;
  const clientSecret = process.env.BLING_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  try {
    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.access_token || null;
  } catch { 
    return null; 
  }
}

async function fetchRealBlingProducts(tentativa = 1): Promise<any[]> {
  let accessToken = await getValidAccessToken();
  if (!accessToken) return [];

  const response = await fetch('https://www.bling.com.br/Api/v3/produtos?limite=100', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    next: { revalidate: 60 } 
  });

  if (response.status === 401 && tentativa === 1) {
    const novoToken = await atualizarTokenBling();
    if (novoToken) {
      const retryResponse = await fetch('https://www.bling.com.br/Api/v3/produtos?limite=100', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${novoToken}`, 'Accept': 'application/json' },
        next: { revalidate: 60 }
      });
      if (retryResponse.ok) {
        const retryJson = await retryResponse.json();
        return retryJson.data || [];
      }
    }
  }

  if (!response.ok) {
    console.error("❌ Erro ao buscar produtos do Bling:", response.status, response.statusText);
    return [];
  }

  const json = await response.json();
  return json.data || [];
}

export async function getProdutosBlingMapeados(): Promise<Product[]> {
  try {
    const produtosBlingRaw = await fetchRealBlingProducts();
    if (!produtosBlingRaw || produtosBlingRaw.length === 0) {
      console.warn("⚠️ Nenhum produto retornado pela API do Bling.");
      return [];
    }
    
    const modelosAgrupados: Record<string, any> = {};

    // 🏆 DICIONÁRIO DE IMAGENS
    const dicionarioImagens: Record<string, string> = {
      "Baby Look (feminina)": "/products/babylook.jpeg", 
      "Vestido": "/products/vestido.png",               
      "Regata": "/products/regata.jpeg",                 
      "Básica (unissex)": "/products/basica.jpeg",       
      "Básica": "/products/basica.jpeg"                    
    };

    produtosBlingRaw.forEach((p: any) => {
      const nomeCompleto = (p.nome || "");
      
      // Filtra para pegar apenas os produtos da Beija-Flor
      if (!nomeCompleto.toUpperCase().includes("BEIJA-FLOR")) return;

      // Ignora o produto "Pai"
      if (!nomeCompleto.includes("Modelo:") && !nomeCompleto.includes("Tamanho:")) return;

      let nomeModelo = "Tradicional";
      let tamanho = "U";

      if (nomeCompleto.includes("Modelo:")) {
        const splitModelo = nomeCompleto.split("Modelo:")[1]; 
        const partes = splitModelo.split(";");
        nomeModelo = partes[0].trim(); 

        const parteTamanho = partes.find((pt: string) => pt.includes("Tamanho:"));
        if (parteTamanho) {
          tamanho = parteTamanho.replace("Tamanho:", "").trim(); 
        }
      }

      const imagemReal = 
        dicionarioImagens[nomeModelo] || 
        p.imagemURL || 
        p.imagem || 
        p.midias?.imagens?.[0]?.link || 
        '/products/camisa1.png';

      if (!modelosAgrupados[nomeModelo]) {
        modelosAgrupados[nomeModelo] = {
          id: p.id, 
          name: `Camisa Beija-Flor - ${nomeModelo}`,
          price: parseFloat(p.preco || 149.90),
          originalPrice: null,
          image: imagemReal,
          images: [imagemReal, '/products/tabela-tamanhos.jpg'],
          handle: p.id.toString(), 
          categories: ['lancamentos'],
          description: `Camisa oficial Beija-Flor Enredo 2027. Modelo exclusivo: ${nomeModelo}.`,
          badge: 'Novo',
          variants: [] 
        };
      }

      const tamanhoJaExiste = modelosAgrupados[nomeModelo].variants.find((v: any) => v.size === tamanho);
      
      if (!tamanhoJaExiste) {
        modelosAgrupados[nomeModelo].variants.push({
          id: p.id,
          size: tamanho,
          stock: p.estoque?.saldoVirtualTotal || 10
        });
      }
    });

    const produtosFinais = Object.values(modelosAgrupados).map((prod: any) => {
      const ordemTamanhos = { 'PP': 1, 'P': 2, 'M': 3, 'G': 4, 'GG': 5, 'XG': 6, 'EXG': 7 };
      prod.variants.sort((a: any, b: any) => 
        (ordemTamanhos[a.size as keyof typeof ordemTamanhos] || 99) - 
        (ordemTamanhos[b.size as keyof typeof ordemTamanhos] || 99)
      );

      return prod;
    });

    return produtosFinais;

  } catch (error) {
    console.error("❌ Erro ao mapear produtos do Bling:", error);
    return []; 
  }
}

export async function getProdutoBlingPorId(id: string): Promise<Product | null> {
  const produtos = await getProdutosBlingMapeados();
  return produtos.find((p) => p.id.toString() === id) || null;
}

async function obterOuCriarIdContatoBling(cliente: {
  nome: string;
  email: string;
  telefone: string;
  numeroDocumento: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  uf: string;
}): Promise<number> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Token de acesso inválido.");

  // Remove caracteres não numéricos do documento para busca precisa
  const docLimpo = cliente.numeroDocumento.replace(/\D/g, '');

  const buscaRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?numeroDocumento=${docLimpo}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
  });

  let contatoExistenteId: number | null = null;

  if (buscaRes.ok) {
    const buscaJson = await buscaRes.json();
    if (buscaJson.data && buscaJson.data.length > 0) {
      contatoExistenteId = buscaJson.data[0].id;
      console.log(`✅ Contato já existe no Bling: ID ${contatoExistenteId} - ${buscaJson.data[0].nome}`);
    }
  }

  const contatoPayload = {
    nome: cliente.nome,
    fantasia: cliente.nome,
    tipo: "F",
    situacao: "A",
    numeroDocumento: docLimpo,
    email: cliente.email,
    telefone: cliente.telefone,
    endereco: {
      geral: cliente.endereco,
      numero: cliente.numero,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      cep: cliente.cep.replace(/\D/g, ''),
      uf: cliente.uf.toUpperCase()
    }
  };

  // Se o contato já existe no Bling (ex: "Client Web"), atualiza ele com os dados reais do comprador
  if (contatoExistenteId) {
    console.log(`🔄 Atualizando o contato existente ID ${contatoExistenteId} para: ${cliente.nome}...`);
    const atualizaRes = await fetch(`https://www.bling.com.br/Api/v3/contatos/${contatoExistenteId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(contatoPayload)
    });

    if (atualizaRes.ok) {
      console.log(`✅ Contato atualizado com sucesso para ${cliente.nome}!`);
      return contatoExistenteId;
    } else {
      const erroAtualizacao = await atualizaRes.json();
      console.warn("⚠️ Falha ao atualizar via PUT, mas prosseguindo com o ID existente:", erroAtualizacao);
      return contatoExistenteId;
    }
  }

  // Caso contrário, cria um novo contato do zero
  console.log(`👤 Cadastrando novo cliente no Bling: ${cliente.nome}...`);
  const criaRes = await fetch('https://www.bling.com.br/Api/v3/contatos', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(contatoPayload)
  });

  const criaJson = await criaRes.json();

  if (!criaRes.ok) {
    console.error("❌ ERRO AO CRIAR CONTATO NO BLING:", JSON.stringify(criaJson, null, 2));
    throw new Error(criaJson.error?.message || "Erro ao criar contato no Bling.");
  }

  const novoId = criaJson.data?.id;
  console.log(`✅ Novo cliente cadastrado com sucesso no Bling! ID: ${novoId}`);
  return novoId;
}

export async function criarPedidoBling(dadosCheckout: {
  cliente: {
    nome: string;
    email: string;
    telefone: string;
    numeroDocumento: string;
    endereco: string;
    numero: string;
    bairro: string;
    cidade: string;
    cep: string;
    uf: string;
  };
  itens: { idProdutoBling: number; quantidade: number; valorUnitario: number; }[];
}) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Não foi possível autenticar no Bling.");

  const idContatoBling = await obterOuCriarIdContatoBling(dadosCheckout.cliente);

  const infoEntrega = `ENDEREÇO DE ENTREGA: ${dadosCheckout.cliente.endereco}, nº ${dadosCheckout.cliente.numero} - Bairro: ${dadosCheckout.cliente.bairro}, ${dadosCheckout.cliente.cidade}/${dadosCheckout.cliente.uf} - CEP: ${dadosCheckout.cliente.cep}`;

  const payload = {
    data: new Date().toISOString().split('T')[0],
    observacoes: infoEntrega,
    contato: {
      id: Number(idContatoBling),
    },
    itens: dadosCheckout.itens.map((item) => ({
      produto: { id: Number(item.idProdutoBling) },
      quantidade: Number(item.quantidade),
      valor: Number(item.valorUnitario),
    })),
  };

  const response = await fetch('https://www.bling.com.br/Api/v3/pedidos/vendas', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const respostaJson = await response.json();

  if (!response.ok) {
    console.error("❌ ERRO BLING DETALHADO:", JSON.stringify(respostaJson, null, 2));
    const mensagemErro = respostaJson.error?.message || JSON.stringify(respostaJson.error?.fields) || "Erro ao registrar pedido no Bling.";
    throw new Error(mensagemErro);
  }

  return respostaJson;
}