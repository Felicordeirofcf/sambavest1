// Black Friday Samba Vest: "Black do Duelo" (Beija-Flor 2027 × Viradouro 2027).
//
// O preço cobrado SEMPRE vem do WooCommerce (o checkout recalcula no servidor). Esta página só
// anuncia o preço Black antes da campanha e, durante a campanha, mostra o preço real do WooCommerce.
// Para valer de verdade, agende o "Preço promocional" de cada produto no WooCommerce (27 a 30/11).
import { kvGet } from './automacao/kv';
import { faseBF, PERIODO_BF } from './blackfridayPeriodo';

export { faseBF };
export type { FaseBF } from './blackfridayPeriodo';

export const BF = {
  ...PERIODO_BF,
  whatsapp: '5521996959903',
};

export type EscolaDuelo = 'beija-flor' | 'viradouro';

export type OfertaBF = {
  id: string;
  escola: EscolaDuelo;
  titulo: string;
  enredo: string;
  descricao: string;
  precoBlack: number;
  imagemReserva: string;
  /** Usa sempre a foto local (frente da camisa), e não a 1ª foto do WooCommerce. */
  fotoFrenteLocal?: boolean;
  /**
   * Foto de alguém VESTINDO a camisa (topo da página). Coloque o arquivo em public/products/ e o
   * caminho aqui, ex.: '/products/vestida-beija-flor.jpg'. Sem ela, mostra a foto da camisa.
   */
  fotoVestida?: string;
  /** ID do produto no WooCommerce: quando informado, usa esse produto (nome, foto, preço e link). */
  produtoId?: number;
  /** Escolhe o produto do WooCommerce pelo nome (minúsculo, sem acento). */
  combina: (nome: string) => boolean;
};

const tem = (n: string, ...p: string[]) => p.every((x) => n.includes(x));
const naoTem = (n: string, ...p: string[]) => p.every((x) => !n.includes(x));
const outrosModelos = ['regata', 'baby', 'vestido', 'kit', 'infantil', 'short'];

export const OFERTAS: OfertaBF[] = [
  {
    id: 'beija-flor-enredo',
    escola: 'beija-flor',
    titulo: 'Camisa Enredo Beija-Flor 2027',
    enredo: 'Zeneida, O Sopro do Pó de Louro',
    descricao: 'Camisa oficial do enredo, 100% poliéster, leve para a quadra e para a avenida.',
    precoBlack: 99,
    imagemReserva: '/products/beija-flor-2027-zeneida.webp',
    fotoFrenteLocal: true,
    combina: (n) => tem(n, 'beija', '2027') && naoTem(n, ...outrosModelos),
  },
  {
    id: 'viradouro-enredo',
    escola: 'viradouro',
    titulo: 'Camisa Enredo Viradouro 2027',
    enredo: 'Griô',
    descricao: 'Camisa oficial do enredo Griô, estampa completa vermelha e dourada.',
    precoBlack: 99,
    imagemReserva: '/products/viradouro27.webp',
    fotoFrenteLocal: true,
    combina: (n) => tem(n, 'viradouro') && naoTem(n, 'algod', '2025', '2026', ...outrosModelos),
  },
  {
    id: 'viradouro-algodao',
    escola: 'viradouro',
    titulo: 'Camisa Viradouro Retrô 80 Anos',
    enredo: 'Retrô 80 anos',
    descricao: 'Edição comemorativa dos 80 anos, camisa vermelha para usar o ano inteiro.',
    precoBlack: 150,
    imagemReserva: '/products/viradouro27.webp',
    produtoId: 794,
    combina: () => false,
  },
];

export type ProdutoBF = OfertaBF & {
  slug?: string;
  imagem: string;
  /** Preço "de": o preço cheio cadastrado no WooCommerce. */
  precoCheio?: number;
  /** Preço que o WooCommerce cobra agora (com ou sem promoção). */
  precoAtual?: number;
  /** ID do produto no WooCommerce. */
  wooId?: number;
  /** Modelo da variação em promoção (abre a página do produto já nele). */
  modelo?: string;
  /** Todos os modelos no preço da Black (ex.: Masculino e Feminino). */
  modelos?: string[];
  /** Tamanhos à venda no preço da Black. */
  tamanhos?: string[];
  encontrado: boolean;
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type WcProduto = {
  id: number;
  name: string;
  slug: string;
  type?: string;
  price: string;
  regular_price: string;
  images?: { src: string }[];
};
type WcVariacao = {
  price: string;
  regular_price: string;
  status?: string;
  stock_status?: string;
  attributes?: { name?: string; option?: string }[];
};

const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EXG', 'G1', 'G2', 'G3', 'G4'];
const atributo = (v: WcVariacao, ...nomes: string[]) =>
  v.attributes?.find((a) => nomes.some((n) => (a.name || '').toLowerCase().includes(n)))?.option || '';

/**
 * Em produto variável o WooCommerce manda o "preço normal" vazio no produto principal:
 * o preço "de" e o preço atual vêm das variações (tamanhos).
 */
async function precosDasVariacoes(
  id: number
): Promise<{ atual?: number; cheio?: number; modelo?: string; modelos?: string[]; tamanhos?: string[] }> {
  const c = credenciaisWoo();
  if (!c) return {};
  try {
    const res = await fetch(`${c.url}/wp-json/wc/v3/products/${id}/variations?per_page=100`, { headers: c.headers, next: { revalidate: 120 } });
    if (!res.ok) return {};
    const lista = ((await res.json()) as WcVariacao[]).filter((v) => (v.status ?? 'publish') === 'publish' && Number(v.price) > 0);
    const aVenda = lista.filter((v) => v.stock_status !== 'outofstock');
    const base = aVenda.length ? aVenda : lista;
    if (!base.length) return {};
    const atual = Math.min(...base.map((v) => Number(v.price)));
    // "de" da variação com o menor preço (o mesmo par que o cliente vê)
    const par = base.find((v) => Number(v.price) === atual)!;
    // Modelos em promoção (ex.: só Unissex, ou Masculino e Feminino). Se for um só, o botão
    // já abre a página do produto nele (evita cair na Regata, que está fora da Black).
    const naPromo = base.filter((v) => Number(v.price) === atual);
    const modelos = [...new Set(naPromo.map((v) => atributo(v, 'modelo', 'model', 'style')).filter(Boolean))];
    const modelo = modelos.length === 1 ? modelos[0] : undefined;
    const doModelo = naPromo;
    const tamanhos = [...new Set(doModelo.map((v) => atributo(v, 'tamanho', 'size')).filter(Boolean))].sort((a, b) => {
      const ia = ORDEM_TAMANHOS.indexOf(a.toUpperCase());
      const ib = ORDEM_TAMANHOS.indexOf(b.toUpperCase());
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return { atual, cheio: Number(par.regular_price) || atual, modelo, modelos, tamanhos: tamanhos.length ? tamanhos : undefined };
  } catch {
    return {};
  }
}

function credenciaisWoo() {
  const url = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;
  if (!key || !secret) return null;
  return { url, headers: { Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') } };
}

async function produtoWooPorId(id: number): Promise<WcProduto | null> {
  const c = credenciaisWoo();
  if (!c) return null;
  try {
    const res = await fetch(`${c.url}/wp-json/wc/v3/products/${id}`, { headers: c.headers, next: { revalidate: 120 } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function produtosWoo(): Promise<WcProduto[]> {
  const url = process.env.NEXT_PUBLIC_WC_URL || 'https://api.sambavest.com';
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;
  if (!key || !secret) return [];
  try {
    const res = await fetch(`${url}/wp-json/wc/v3/products?status=publish&per_page=100`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') },
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const lista = await res.json();
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export async function produtosBF(): Promise<ProdutoBF[]> {
  const [woo, ...porId] = await Promise.all([produtosWoo(), ...OFERTAS.map((o) => (o.produtoId ? produtoWooPorId(o.produtoId) : null))]);
  const usados = new Set<number>(porId.filter(Boolean).map((p) => p!.id));
  const escolhidos: (WcProduto | undefined)[] = [];
  OFERTAS.forEach((o, i) => {
    const fixo = porId[i];
    const p = fixo || (o.produtoId ? undefined : woo.find((w) => !usados.has(w.id) && o.combina(semAcento(w.name))));
    if (p) usados.add(p.id);
    escolhidos[i] = p || undefined;
  });
  const variacoes = await Promise.all(escolhidos.map((p) => (p && p.type === 'variable' ? precosDasVariacoes(p.id) : null)));
  return OFERTAS.map((o, i) => {
    const p = escolhidos[i];
    const fixo = porId[i];
    if (!p) return { ...o, imagem: o.imagemReserva, encontrado: false };
    const v = variacoes[i];
    const atual = v?.atual ?? (Number(p.price) || undefined);
    const cheio = v?.cheio ?? (Number(p.regular_price) || atual);
    return {
      ...o,
      // Produto escolhido pelo ID: o nome que vale é o do WooCommerce
      titulo: fixo ? p.name : o.titulo,
      wooId: p.id,
      slug: p.slug || String(p.id),
      imagem: o.fotoFrenteLocal ? o.imagemReserva : p.images?.[0]?.src || o.imagemReserva,
      precoCheio: cheio,
      precoAtual: atual,
      modelo: v?.modelo,
      modelos: v?.modelos,
      tamanhos: v?.tamanhos,
      encontrado: true,
    };
  });
}

export const chaveVoto = (e: EscolaDuelo) => `bf2026:voto:${e}`;

export async function placarDuelo(): Promise<Record<EscolaDuelo, number>> {
  const [b, v] = await Promise.all([kvGet<number>(chaveVoto('beija-flor')), kvGet<number>(chaveVoto('viradouro'))]).catch(() => [0, 0]);
  return { 'beija-flor': Number(b) || 0, viradouro: Number(v) || 0 };
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
