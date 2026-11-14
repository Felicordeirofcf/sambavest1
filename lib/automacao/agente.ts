// Atendente do WhatsApp com IA (Claude + ferramentas).
//
// Como funciona (o "loop de agente"):
//   1. Mandamos para o modelo: instruções da loja + histórico da conversa + lista de ferramentas.
//   2. O modelo responde com texto OU pede para usar uma ferramenta (ex.: consultar_pedidos).
//   3. Executamos a ferramenta aqui no servidor e devolvemos o resultado ao modelo.
//   4. Repete até o modelo dar a resposta final (ou pedir para transferir a uma pessoa).
//
// Segurança:
//   - O telefone do cliente NUNCA vem do modelo: a ferramenta de pedidos usa o número da conversa.
//     Assim ninguém consegue "pedir para a IA" os dados do pedido de outra pessoa.
//   - O modelo só pode afirmar o que vem das ferramentas ou do conhecimento configurado.
//   - Qualquer erro (API fora, limite de passos) = a conversa vai para uma pessoa.
import { config } from './config';
import type { Conversa } from './conversas';
import { meta, mesmoTelefone, obterPedido, pedidosDoTelefone, wc, WcPedido } from './woocommerce';
import { products } from '../products';
import { MEDIDAS, regrasComerciais } from './conhecimentoLoja';

const API = 'https://api.anthropic.com/v1/messages';
const MAX_PASSOS = 5; // chamadas ao modelo por mensagem do cliente
const TIMEOUT_MS = 25_000;

// ---------- Tipos da API de mensagens ----------

type Bloco =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

type MensagemApi = { role: 'user' | 'assistant'; content: string | Bloco[] };

type RespostaApi = {
  content: Bloco[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string;
  usage?: { input_tokens: number; output_tokens: number };
};

export type PassoFerramenta = { nome: string; entrada: Record<string, unknown>; saida: string };

export type ResultadoAgente = {
  texto?: string; // resposta para o cliente
  humano: boolean; // passar para uma pessoa
  motivoHumano?: string;
  pedidos?: number[];
  ferramentas: PassoFerramenta[]; // o que a IA consultou (aparece no simulador)
  tokens: { entrada: number; saida: number };
};

// ---------- Ferramentas ----------

const FERRAMENTAS = [
  {
    name: 'consultar_pedidos',
    description:
      'Consulta os pedidos feitos com o telefone deste cliente (status, itens, rastreio). ' +
      'Use quando o cliente perguntar de pedido, compra, entrega, rastreio ou pagamento. ' +
      'Se o cliente informar o número do pedido, passe em numero_pedido. ' +
      'Só retorna pedidos cujo telefone de cadastro é o mesmo desta conversa.',
    input_schema: {
      type: 'object',
      properties: { numero_pedido: { type: 'integer', description: 'Número do pedido, se o cliente informou' } },
    },
  },
  {
    name: 'buscar_produtos',
    description:
      'Busca camisas no catálogo da loja por escola de samba, enredo, ano ou nome. ' +
      'Retorna nome, preço, modelos, tamanhos e link. Use antes de falar de qualquer produto ou preço.',
    input_schema: {
      type: 'object',
      properties: { busca: { type: 'string', description: 'Ex.: "Portela", "Beija-Flor 2027", "baby look"' } },
      required: ['busca'],
    },
  },
  {
    name: 'montar_link_compra',
    description:
      'Monta a sacola com os itens que o cliente escolheu e devolve um link: o cliente abre, põe o CEP e paga no site. ' +
      'Use quando o cliente quiser comprar e você já tiver confirmado com ele produto, modelo, tamanho e quantidade. ' +
      'Use o nome exato do produto que veio de buscar_produtos.',
    input_schema: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              produto: { type: 'string', description: 'Nome exato do produto (de buscar_produtos)' },
              modelo: { type: 'string', description: 'Ex.: "Unissex", "Baby look", "Regata", "Vestido". Vazio se o produto só tem um modelo' },
              tamanho: { type: 'string', description: 'Ex.: "P", "M", "G", "GG", "XGG", "EXG"' },
              quantidade: { type: 'integer', description: 'Padrão 1' },
            },
            required: ['produto', 'tamanho'],
          },
        },
      },
      required: ['itens'],
    },
  },
  {
    name: 'transferir_para_humano',
    description:
      'Passa a conversa para uma pessoa da loja. Use quando: o cliente pedir para falar com alguém; ' +
      'pedir devolução ou cancelamento; relatar defeito ou problema na entrega; estiver irritado; ' +
      'quiser trocar de tamanho (SÓ depois de juntar pedido, tamanho que veio e tamanho novo — veja TROCAS); ' +
      'pedir desconto ou condição especial; ou quando a informação necessária não estiver nas ferramentas nem no conhecimento da loja.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Resumo curto para a equipe (ex.: "troca de tamanho: pedido 1234, camisa Viradouro unissex, veio M, quer G")' },
        mensagem_cliente: { type: 'string', description: 'Mensagem curta avisando o cliente que uma pessoa vai responder' },
      },
      required: ['motivo', 'mensagem_cliente'],
    },
  },
];

const STATUS: Record<string, string> = {
  pending: 'aguardando pagamento',
  'on-hold': 'aguardando confirmação do pagamento',
  processing: 'pagamento aprovado, em separação/produção',
  completed: 'enviado',
  cancelled: 'cancelado',
  refunded: 'reembolsado',
  failed: 'pagamento não aprovado',
};

function resumoPedido(p: WcPedido) {
  const rastreio = meta(p, '_sv_rastreio') || meta(p, '_correios_tracking_code');
  return {
    pedido: p.id,
    data: p.date_created_gmt?.slice(0, 10),
    status: STATUS[p.status] || p.status,
    itens: p.line_items.map((i) => `${i.quantity}x ${i.name}`),
    total: `R$ ${p.total}`,
    rastreio: rastreio || null,
    link_rastreio: rastreio ? `https://www.melhorrastreio.com.br/rastreio/${rastreio}` : null,
    primeiro_nome: (p.billing.first_name || '').split(' ')[0],
  };
}

async function consultarPedidos(numeroCliente: string, numeroPedido?: number) {
  if (!numeroCliente) return { erro: 'telefone do cliente desconhecido' };
  let pedidos: WcPedido[] = [];
  if (numeroPedido) {
    try {
      const p = await obterPedido(numeroPedido);
      if (mesmoTelefone(p.billing?.phone || '', numeroCliente) || mesmoTelefone(p.shipping?.phone || '', numeroCliente)) {
        pedidos = [p];
      } else {
        return { encontrados: 0, aviso: 'Pedido não está no telefone deste WhatsApp. Por privacidade, não informe nada dele; peça para escrever do número usado na compra ou transfira para uma pessoa.' };
      }
    } catch {
      return { encontrados: 0, aviso: `Pedido ${numeroPedido} não encontrado.` };
    }
  } else {
    pedidos = (await pedidosDoTelefone(numeroCliente)).filter((p) => !['checkout-draft', 'trash'].includes(p.status));
  }
  if (!pedidos.length) return { encontrados: 0, aviso: 'Nenhum pedido neste telefone nos últimos 180 dias. Pergunte o número do pedido.' };
  return { encontrados: pedidos.length, pedidos: pedidos.slice(0, 3).map(resumoPedido) };
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Catálogo: o mesmo do site (WooCommerce), com cache curto. O preço do Woo já é o preço cobrado
// (inclusive promoções/Black Friday, que ficam como "preço promocional" no próprio Woo).
type ItemCatalogo = { nome: string; preco: number; precoAntigo?: number; tamanhos: string[]; disponivel: boolean; link: string; busca: string };
type WcProdutoLista = {
  name: string;
  slug: string;
  price: string;
  regular_price: string;
  on_sale: boolean;
  stock_status: string;
  categories?: { name: string }[];
  attributes?: { name: string; options: string[] }[];
};
let cacheCatalogo: { em: number; itens: ItemCatalogo[] } | null = null;

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

async function catalogo(): Promise<ItemCatalogo[]> {
  if (cacheCatalogo && Date.now() - cacheCatalogo.em < 5 * 60_000) return cacheCatalogo.itens;
  let itens: ItemCatalogo[];
  try {
    const lista = await wc<WcProdutoLista[]>('/products?status=publish&per_page=100');
    itens = lista.map((p) => {
      const tamanhos = p.attributes?.find((a) => /tamanho|size/i.test(a.name))?.options || [];
      const outros = (p.attributes || []).flatMap((a) => a.options).join(' ');
      const preco = Number(p.price || p.regular_price || 0);
      const regular = Number(p.regular_price || 0);
      return {
        nome: p.name,
        preco,
        precoAntigo: p.on_sale && regular > preco ? regular : undefined,
        tamanhos,
        disponivel: p.stock_status !== 'outofstock',
        link: `${config.siteUrl}/produto/${p.slug}`,
        busca: normalizar(`${p.name} ${(p.categories || []).map((c) => c.name).join(' ')} ${outros}`),
      };
    });
  } catch (e) {
    // Woo fora do ar: usa o catálogo estático do site como reserva
    console.error('[agente] catálogo do Woo indisponível:', (e as Error).message);
    itens = products.map((p) => ({
      nome: p.name,
      preco: p.price,
      precoAntigo: p.originalPrice || undefined,
      tamanhos: [...new Set(p.variants.map((v) => v.size))],
      disponivel: true,
      link: `${config.siteUrl}/produto/${p.handle}`,
      busca: normalizar(`${p.name} ${p.categories.join(' ')} ${p.variants.map((v) => v.model).join(' ')}`),
    }));
    return itens; // não guarda a reserva no cache
  }
  cacheCatalogo = { em: Date.now(), itens };
  return itens;
}

// Palavras que não ajudam a achar o produto
const VAZIAS = new Set(['camisa', 'camisas', 'de', 'da', 'do', 'tem', 'voces', 'quero', 'a', 'o', 'e', 'pra', 'para', 'escola', 'samba']);

async function buscarProdutos(busca: string) {
  const termos = normalizar(busca).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !VAZIAS.has(t));
  const itens = await catalogo();
  const pontuados = (termos.length ? itens : [])
    .map((p) => ({ p, pontos: termos.filter((t) => p.busca.includes(t)).length }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 5);
  if (!pontuados.length) {
    return {
      encontrados: 0,
      aviso: 'Nada no catálogo com esse termo. Não diga que a loja "não tem" de forma definitiva: ofereça o site e, se o cliente insistir, transfira.',
      site: config.siteUrl,
      escolas_no_catalogo: [...new Set(itens.map((p) => p.nome))].slice(0, 15),
    };
  }
  return {
    encontrados: pontuados.length,
    produtos: pontuados.map(({ p }) => ({
      nome: p.nome,
      preco: brl(p.preco),
      preco_antigo: p.precoAntigo ? brl(p.precoAntigo) : null,
      tamanhos: p.tamanhos,
      disponivel: p.disponivel,
      link: p.link,
    })),
  };
}

// ---------- Instruções (system prompt) ----------

function instrucoes(nomeCliente?: string): string {
  const r = config.whatsapp.respostas;
  const extra = (config.whatsapp.ia.conhecimento || '').replace(/\\n/g, '\n');
  return `Você é a atendente virtual da ${config.lojaNome} no WhatsApp. A loja vende camisas de enredo de escolas de samba do Rio de Janeiro. Site: ${config.siteUrl}
${nomeCliente ? `O cliente se chama ${nomeCliente} (nome do perfil do WhatsApp).` : ''}

COMO RESPONDER
- Português do Brasil, tom simpático e direto, como uma pessoa da loja. Mensagens curtas (no máximo ~5 linhas). Pode usar 1 emoji quando combinar.
- Sem markdown (nada de ** ou #). Links sempre completos.
- Uma pergunta por vez quando faltar informação.

REGRA MAIS IMPORTANTE
- Só afirme o que veio das ferramentas ou do CONHECIMENTO DA LOJA abaixo. Nunca invente preço, prazo, medida, estoque, desconto ou política.
- Se não souber, use transferir_para_humano. É melhor passar para uma pessoa do que chutar.
- Nunca prometa desconto, brinde, frete grátis ou exceção.
- Pedidos: sempre use consultar_pedidos antes de falar do status. Se não achar, peça o número do pedido.
- Produtos/preços: sempre use buscar_produtos antes de citar.
- COMPRA PELO WHATSAPP: quando o cliente quiser comprar, confirme numa mensagem curta o que ele quer (produto, modelo, tamanho, quantidade e preço de buscar_produtos) e, com o "sim" dele, use montar_link_compra e mande o link com o resumo e o total dos produtos. Explique que é só abrir o link, colocar o CEP (o frete aparece lá) e pagar por Pix ou cartão em até 3x. NUNCA peça endereço, CPF ou dados de cartão pela conversa: isso é feito no site. Se montar_link_compra disser que algo está esgotado, ofereça os tamanhos com estoque.
- Tamanho: use a tabela de MEDIDAS abaixo e o passo a passo de como ajudar. Diga as medidas do modelo que o cliente quer (unissex, baby look, regata ou vestido).

CONHECIMENTO DA LOJA
- Prazo: ${r.prazo}
- TROCAS: o cliente pode pedir até 7 dias corridos depois de receber (tamanho ou arrependimento); defeito, até 30 dias. A peça precisa estar com etiqueta, sem uso, sem lavagem e sem ajustes. O frete da troca é por conta da loja (o cliente não paga nada para trocar). O prazo para a nova peça chegar a equipe confirma na hora: não prometa prazo de troca.
- Como conduzir uma troca de tamanho (faça você mesma antes de passar para a equipe):
  1. Use consultar_pedidos e confirme qual pedido e qual camisa (se tiver mais de um, pergunte).
  2. Pergunte o tamanho que veio e o tamanho que quer. Se a pessoa estiver em dúvida, ajude com a tabela de MEDIDAS.
  3. Explique: a troca é sem custo, a loja paga o frete, e a equipe vai mandar por aqui as instruções para enviar a peça e confirmar o prazo.
  4. Só então chame transferir_para_humano com o resumo (pedido, camisa, tamanho que veio → tamanho novo).
- Defeito: peça o número do pedido e uma descrição curta do problema; diga que a equipe vai resolver sem custo e transfira.
- Devolução ou cancelamento: transfira para uma pessoa.
- Política completa: ${config.siteUrl}/trocas-e-devolucoes
- Rastrear pedido no site: ${config.siteUrl}/rastrear-pedido
${regrasComerciais()}

${MEDIDAS}
${extra ? extra : ''}`.trim();
}

// ---------- Histórico ----------

/** Converte as últimas mensagens da conversa para o formato da API (alternando user/assistant). */
function historico(c: Conversa | null, novaMensagem: string): MensagemApi[] {
  const msgs: MensagemApi[] = [];
  const ultimas = (c?.mensagens || []).slice(-config.whatsapp.ia.historico);
  for (const m of ultimas) {
    if (m.de === 'aviso') continue;
    const role = m.de === 'cliente' ? 'user' : 'assistant';
    const ant = msgs[msgs.length - 1];
    if (ant && ant.role === role) ant.content = `${ant.content}\n${m.texto}`;
    else msgs.push({ role, content: m.texto });
  }
  // A mensagem nova já pode estar no histórico (processarMensagem grava antes de chamar a IA)
  const ultima = msgs[msgs.length - 1];
  if (!ultima || ultima.role !== 'user' || !String(ultima.content).endsWith(novaMensagem)) {
    if (ultima?.role === 'user') ultima.content = `${ultima.content}\n${novaMensagem}`;
    else msgs.push({ role: 'user', content: novaMensagem });
  }
  // A API exige começar pelo cliente. O que a loja mandou antes (ex.: lembrete de Pix ou de
  // carrinho) vira contexto na primeira mensagem do cliente, para a IA saber do que se trata.
  const antes: string[] = [];
  while (msgs.length && msgs[0].role !== 'user') antes.push(String(msgs.shift()!.content));
  if (antes.length && msgs[0]) msgs[0].content = `(Antes, a loja tinha mandado: "${antes.join(' / ').slice(0, 800)}")\n${msgs[0].content}`;
  return msgs;
}

// ---------- Loop do agente ----------

async function chamarModelo(system: string, messages: MensagemApi[]): Promise<RespostaApi> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.whatsapp.ia.chave || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: config.whatsapp.ia.modelo, max_tokens: 600, system, tools: FERRAMENTAS, messages }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export function iaDisponivel(): boolean {
  return Boolean(config.whatsapp.ia.chave);
}

/**
 * Gera a resposta da IA para a mensagem do cliente.
 * @param numeroCliente telefone da conversa (usado na consulta de pedidos — nunca vem do modelo)
 */
export async function responderComIA(params: {
  numeroCliente: string;
  texto: string;
  conversa: Conversa | null;
}): Promise<ResultadoAgente> {
  const res: ResultadoAgente = { humano: false, ferramentas: [], tokens: { entrada: 0, saida: 0 } };
  if (!iaDisponivel()) return { ...res, humano: true, motivoHumano: 'ANTHROPIC_API_KEY não configurada' };

  const system = instrucoes(params.conversa?.nome);
  const messages = historico(params.conversa, params.texto);

  for (let passo = 0; passo < MAX_PASSOS; passo++) {
    const r = await chamarModelo(system, messages);
    res.tokens.entrada += r.usage?.input_tokens || 0;
    res.tokens.saida += r.usage?.output_tokens || 0;
    messages.push({ role: 'assistant', content: r.content });

    const pedidosFerramentas = r.content.filter((b): b is Extract<Bloco, { type: 'tool_use' }> => b.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !pedidosFerramentas.length) {
      const texto = r.content
        .filter((b): b is Extract<Bloco, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!texto) return { ...res, humano: true, motivoHumano: 'IA não gerou resposta' };
      return { ...res, texto };
    }

    const resultados: Bloco[] = [];
    for (const f of pedidosFerramentas) {
      if (f.name === 'transferir_para_humano') {
        res.ferramentas.push({ nome: f.name, entrada: f.input, saida: '—' });
        return {
          ...res,
          humano: true,
          motivoHumano: String(f.input.motivo || 'IA pediu atendimento humano'),
          texto: String(f.input.mensagem_cliente || '') || undefined,
        };
      }
      let saida: unknown;
      try {
        if (f.name === 'consultar_pedidos') {
          const num = Number(f.input.numero_pedido) || undefined;
          saida = await consultarPedidos(params.numeroCliente, num);
          const achados = (saida as { pedidos?: { pedido: number }[] }).pedidos;
          if (achados) res.pedidos = achados.map((p) => p.pedido);
        } else if (f.name === 'montar_link_compra') {
          const { montarLinkCompra } = await import('./sacolaPronta');
          saida = await montarLinkCompra(Array.isArray(f.input.itens) ? (f.input.itens as never[]) : []);
        } else if (f.name === 'buscar_produtos') {
          saida = await buscarProdutos(String(f.input.busca || ''));
        } else {
          saida = { erro: `ferramenta desconhecida: ${f.name}` };
        }
      } catch (e) {
        saida = { erro: (e as Error).message };
      }
      const json = JSON.stringify(saida);
      res.ferramentas.push({ nome: f.name, entrada: f.input, saida: json });
      resultados.push({ type: 'tool_result', tool_use_id: f.id, content: json });
    }
    messages.push({ role: 'user', content: resultados });
  }
  return { ...res, humano: true, motivoHumano: 'IA passou do limite de passos' };
}
