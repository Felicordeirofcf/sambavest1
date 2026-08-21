// lib/bling.ts
import { Product } from './products';

let accessToken = process.env.BLING_ACCESS_TOKEN;
let refreshToken = process.env.BLING_REFRESH_TOKEN;

async function atualizarTokenBling() {
  console.log("🔄 Tentando atualizar o Token do Bling automaticamente...");
  if (!refreshToken) return false;

  const credentials = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
  try {
    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    if (!response.ok) return false;
    const data = await response.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    return true;
  } catch { return false; }
}

async function fetchRealBlingProducts(tentativa = 1): Promise<any[]> {
  if (!accessToken) return [];
  const response = await fetch('https://www.bling.com.br/Api/v3/produtos', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    cache: 'no-store' 
  });
  if (response.status === 401 && tentativa === 1) {
    const renovou = await atualizarTokenBling();
    if (renovou) return fetchRealBlingProducts(2);
  }
  const json = await response.json();
  return json.data || [];
}

export async function getProdutosBlingMapeados(): Promise<Product[]> {
  try {
    const produtosBlingRaw = await fetchRealBlingProducts();
    if (!produtosBlingRaw) return [];
    
    const modelosAgrupados: Record<string, any> = {};

    // 🏆 DICIONÁRIO DE IMAGENS: Tudo padronizado para .jpg
    const dicionarioImagens: Record<string, string> = {
      "Baby Look (feminina)": "/products/babylook.jpg", 
      "Vestido": "/products/vestido.jpg",               
      "Regata": "/products/regata.jpg",                 
      "Básica (unissex)": "/products/basica.jpg",       
      "Básica": "/products/basica.jpg"                  
    };

    produtosBlingRaw.forEach((p: any) => {
      const nomeCompleto = (p.nome || "");
      
      // Filtra para pegar apenas os produtos da Beija-Flor
      if (!nomeCompleto.toUpperCase().includes("BEIJA-FLOR")) return;

      // Ignora o produto "Pai"
      if (!nomeCompleto.includes("Modelo:") && !nomeCompleto.includes("Tamanho:")) return;

      let nomeModelo = "Tradicional";
      let tamanho = "U";

      // Puxa dinamicamente qual é o Modelo e o Tamanho
      if (nomeCompleto.includes("Modelo:")) {
        const splitModelo = nomeCompleto.split("Modelo:")[1]; 
        const partes = splitModelo.split(";");
        nomeModelo = partes[0].trim(); 

        const parteTamanho = partes.find(pt => pt.includes("Tamanho:"));
        if (parteTamanho) {
          tamanho = parteTamanho.replace("Tamanho:", "").trim(); 
        }
      }

      // Prioriza a imagem do nosso dicionário local. Se não tiver, tenta a do Bling. Se falhar, usa a genérica.
      const imagemReal = 
        dicionarioImagens[nomeModelo] || 
        p.imagemURL || 
        p.imagem || 
        p.midias?.imagens?.[0]?.link || 
        '/products/camisa1.png';

      // Cria o Card do Modelo na vitrine se ele ainda não existir
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

      // BLOQUEIO DE DUPLICADOS
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
      // ORDENAÇÃO DOS TAMANHOS
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

// Função auxiliar para buscar ou criar o contato no Bling antes de gerar o pedido
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
  const buscaRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?numeroDocumento=${cliente.numeroDocumento}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
  });

  if (buscaRes.ok) {
    const buscaJson = await buscaRes.json();
    if (buscaJson.data && buscaJson.data.length > 0) {
      console.log(`✅ Contato já existe no Bling: ID ${buscaJson.data[0].id}`);
      return buscaJson.data[0].id;
    }
  }

  console.log(`👤 Criando novo contato no Bling para: ${cliente.nome}...`);
  const contatoPayload = {
    nome: cliente.nome,
    fantasia: cliente.nome,
    tipo: "F",
    situacao: "A",
    numeroDocumento: cliente.numeroDocumento,
    email: cliente.email,
    telefone: cliente.telefone,
    endereco: {
      geral: cliente.endereco,
      numero: cliente.numero,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      cep: cliente.cep,
      uf: cliente.uf
    }
  };

  const criaRes = await fetch('https://www.bling.com.br/Api/v3/contatos', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(contatoPayload)
  });

  if (!criaRes.ok) {
    const erroContato = await criaRes.json();
    console.error("❌ ERRO AO CRIAR CONTATO NO BLING:", JSON.stringify(erroContato, null, 2));
    return 18342484482; 
  }

  const criaJson = await criaRes.json();
  const novoId = criaJson.data?.id;
  console.log(`✅ Novo contato criado com sucesso! ID: ${novoId}`);
  return novoId || 18342484482;
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
  if (!accessToken) {
    const renovou = await atualizarTokenBling();
    if (!renovou) throw new Error("Não foi possível autenticar.");
  }

  const idContatoBling = await obterOuCriarIdContatoBling(dadosCheckout.cliente);

  const infoEntrega = `ENDEREÇO DE ENTREGA: ${dadosCheckout.cliente.endereco}, nº ${dadosCheckout.cliente.numero} - Bairro: ${dadosCheckout.cliente.bairro}, ${dadosCheckout.cliente.cidade}/${dadosCheckout.cliente.uf} - CEP: ${dadosCheckout.cliente.cep}`;

  const payload = {
    data: new Date().toISOString().split('T')[0],
    observacoes: infoEntrega,
    contato: {
      id: idContatoBling,
    },
    itens: dadosCheckout.itens.map((item) => ({
      produto: { id: item.idProdutoBling },
      quantidade: item.quantidade,
      valor: item.valorUnitario,
    })),
  };

  const response = await fetch('https://www.bling.com.br/Api/v3/pedidos/vendas', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const erro = await response.json();
    console.error("❌ ERRO BLING DETALHADO:", JSON.stringify(erro, null, 2));
    throw new Error("Erro ao registrar pedido no Bling.");
  }

  return await response.json();
}