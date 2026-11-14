// "Sacola pronta": a IA do WhatsApp monta a sacola do cliente e manda um link. Ao abrir, o site
// enche a sacola e vai direto para o checkout, onde o cliente põe o CEP, o endereço e paga.
// Preço e estoque vêm do WooCommerce na hora (o checkout confere de novo antes de cobrar).
// Nada de endereço ou cartão passa pelo WhatsApp.
import crypto from 'node:crypto';
import { config } from './config';
import { kvGet, kvSet } from './kv';
import { wc } from './woocommerce';

const VALIDADE_S = 7 * 86_400;
const chave = (id: string) => `sacola:${id}`;

export type ItemSacola = { id: number; nome: string; qtd: number; preco: number; imagem?: string; tamanho?: string };

export async function lerSacola(id: string): Promise<ItemSacola[] | null> {
  if (!/^[a-z0-9]{8,24}$/i.test(id)) return null;
  return kvGet<ItemSacola[]>(chave(id)).catch(() => null);
}

const sem = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

type WcProdutoBusca = {
  id: number;
  name: string;
  type: string;
  price: string;
  stock_status: string;
  purchasable?: boolean;
  images?: { src: string }[];
};
type WcVariacao = {
  id: number;
  price: string;
  stock_status: string;
  purchasable?: boolean;
  image?: { src?: string } | null;
  attributes: { name: string; option: string }[];
};

/** Modelo pedido pelo cliente bate com o da variação? ("unissex" ~ "UNISEX", "baby look" ~ "Feminino Baby Look"…) */
function modeloBate(pedido: string, opcao: string): boolean {
  const a = sem(pedido).replace(/unissex/g, 'unisex').replace(/[^a-z0-9 ]/g, '');
  const b = sem(opcao).replace(/unissex/g, 'unisex').replace(/[^a-z0-9 ]/g, '');
  if (!a) return true;
  if (b.includes(a) || a.includes(b)) return true;
  if (/baby|femin/.test(a) && /baby|femin/.test(b)) return true;
  // Camisa "comum": unissex = masculina = básica = tradicional (o Woo usa nomes diferentes por escola)
  const comum = (t: string) => /unisex|masc|basica|tradicional|classica/.test(t);
  if (comum(a) && comum(b)) return true;
  return false;
}

export type PedidoItemIA = { produto: string; modelo?: string; tamanho: string; quantidade?: number };

/** Resolve os itens pedidos pela IA (nome do produto + modelo + tamanho) e cria o link. */
export async function montarLinkCompra(itens: PedidoItemIA[]): Promise<Record<string, unknown>> {
  if (!Array.isArray(itens) || !itens.length) return { ok: false, erro: 'Nenhum item informado.' };
  const sacola: ItemSacola[] = [];
  const problemas: string[] = [];

  for (const pedido of itens.slice(0, 10)) {
    const nome = String(pedido.produto || '').trim();
    const tamanho = String(pedido.tamanho || '').trim().toUpperCase();
    const qtd = Math.min(10, Math.max(1, Math.floor(Number(pedido.quantidade)) || 1));
    if (!nome || !tamanho) {
      problemas.push(`Item sem produto ou tamanho (${nome || '?'} / ${tamanho || '?'}).`);
      continue;
    }
    const encontrados = await wc<WcProdutoBusca[]>(`/products?status=publish&per_page=10&search=${encodeURIComponent(nome)}`).catch(() => []);
    const produto = encontrados.find((p) => sem(p.name) === sem(nome)) || encontrados[0];
    if (!produto) {
      problemas.push(`Não achei "${nome}" no catálogo. Use o nome exato que veio de buscar_produtos.`);
      continue;
    }

    if (produto.type !== 'variable') {
      if (produto.stock_status === 'outofstock' || !Number(produto.price)) {
        problemas.push(`${produto.name} está esgotado.`);
        continue;
      }
      sacola.push({ id: produto.id, nome: `${produto.name} (${tamanho})`, qtd, preco: Number(produto.price), imagem: produto.images?.[0]?.src, tamanho });
      continue;
    }

    const variacoes = await wc<WcVariacao[]>(`/products/${produto.id}/variations?per_page=100`).catch(() => []);
    const atributo = (v: WcVariacao, re: RegExp) => v.attributes.find((a) => re.test(sem(a.name)))?.option || '';
    const doTamanho = variacoes.filter((v) => sem(atributo(v, /tamanho|size/)) === sem(tamanho));
    const candidatas = doTamanho.filter((v) => modeloBate(pedido.modelo || '', atributo(v, /modelo|tipo|model/)));
    const escolhida = candidatas.find((v) => v.stock_status !== 'outofstock' && Number(v.price) > 0);
    if (!escolhida) {
      const disponiveis = variacoes
        .filter((v) => v.stock_status !== 'outofstock' && Number(v.price) > 0)
        .filter((v) => modeloBate(pedido.modelo || '', atributo(v, /modelo|tipo|model/)))
        .map((v) => atributo(v, /tamanho|size/))
        .filter(Boolean);
      problemas.push(
        doTamanho.length && candidatas.length
          ? `${produto.name} ${pedido.modelo || ''} ${tamanho} está esgotado. Tamanhos com estoque: ${[...new Set(disponiveis)].join(', ') || 'nenhum'}.`
          : !candidatas.length && pedido.modelo && !variacoes.some((v) => modeloBate(pedido.modelo || '', atributo(v, /modelo|tipo|model/)))
            ? `${produto.name} não tem o modelo "${pedido.modelo}". Modelos: ${[...new Set(variacoes.map((v) => atributo(v, /modelo|tipo|model/)).filter(Boolean))].join(', ')}.`
            : `${produto.name}: não existe ${pedido.modelo ? `modelo "${pedido.modelo}" no ` : ''}tamanho ${tamanho}. Com estoque: ${[...new Set(disponiveis)].join(', ') || 'nenhum'}.`
      );
      continue;
    }
    const modelo = atributo(escolhida, /modelo|tipo|model/);
    sacola.push({
      id: escolhida.id,
      nome: `${produto.name} ${modelo ? `(${modelo} - ${tamanho})` : `(${tamanho})`}`,
      qtd,
      preco: Number(escolhida.price),
      imagem: escolhida.image?.src || produto.images?.[0]?.src,
      tamanho: modelo ? `${modelo} - ${tamanho}` : tamanho,
    });
  }

  if (!sacola.length) return { ok: false, problemas, instrucao: 'Explique o problema ao cliente e ofereça outra opção (outro tamanho/modelo).' };
  const id = crypto.randomBytes(9).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 12) || crypto.randomUUID().slice(0, 12);
  await kvSet(chave(id), sacola, VALIDADE_S);
  const total = sacola.reduce((s, i) => s + i.preco * i.qtd, 0);
  const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  return {
    ok: true,
    link: `${config.siteUrl.replace(/\/$/, '')}/checkout?sacola=${id}&utm_source=whatsapp&utm_medium=ia&utm_campaign=atendimento`,
    itens: sacola.map((i) => ({ nome: i.nome, quantidade: i.qtd, preco: brl(i.preco) })),
    total_produtos: brl(total),
    problemas: problemas.length ? problemas : undefined,
    instrucao:
      'Mande o link ao cliente com o resumo dos itens e o total dos produtos. Diga que é só abrir, colocar o CEP (o frete aparece lá) e pagar por Pix ou cartão em até 3x. O link vale 7 dias.',
  };
}
