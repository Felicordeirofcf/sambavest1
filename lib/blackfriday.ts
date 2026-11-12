// Black Friday Samba Vest: "Black do Duelo" (Beija-Flor 2027 × Viradouro 2027).
//
// O preço cobrado SEMPRE vem do WooCommerce (o checkout recalcula no servidor). Esta página só
// anuncia o preço Black antes da campanha e, durante a campanha, mostra o preço real do WooCommerce.
// Para valer de verdade, agende o "Preço promocional" de cada produto no WooCommerce (27 a 30/11).
import { kvGet } from './automacao/kv';

export const BF = {
  // Horário de Brasília
  inicio: new Date('2026-11-27T00:00:00-03:00'),
  fim: new Date('2026-11-30T23:59:59-03:00'),
  descontoPix: 0.1,
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
    combina: (n) => tem(n, 'viradouro') && naoTem(n, 'algod', '2025', '2026', ...outrosModelos),
  },
  {
    id: 'viradouro-algodao',
    escola: 'viradouro',
    titulo: 'Camisa Viradouro Vermelha de Algodão',
    enredo: 'Vermelho e branco de Niterói',
    descricao: 'Camisa vermelha 100% algodão, para usar o ano inteiro.',
    precoBlack: 150,
    imagemReserva: '/products/camisa_viradouro_grio.webp',
    combina: (n) => tem(n, 'viradouro', 'algod'),
  },
];

export type ProdutoBF = OfertaBF & {
  slug?: string;
  imagem: string;
  /** Preço "de": o preço cheio cadastrado no WooCommerce. */
  precoCheio?: number;
  /** Preço que o WooCommerce cobra agora (com ou sem promoção). */
  precoAtual?: number;
  encontrado: boolean;
};

export type FaseBF = 'antes' | 'durante' | 'depois';

export function faseBF(agora = Date.now()): FaseBF {
  if (agora < BF.inicio.getTime()) return 'antes';
  if (agora <= BF.fim.getTime()) return 'durante';
  return 'depois';
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type WcProduto = { id: number; name: string; slug: string; price: string; regular_price: string; images?: { src: string }[] };

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
  const woo = await produtosWoo();
  const usados = new Set<number>();
  return OFERTAS.map((o) => {
    const p = woo.find((w) => !usados.has(w.id) && o.combina(semAcento(w.name)));
    if (!p) return { ...o, imagem: o.imagemReserva, encontrado: false };
    usados.add(p.id);
    const atual = Number(p.price) || undefined;
    const cheio = Number(p.regular_price) || atual;
    return { ...o, slug: p.slug, imagem: p.images?.[0]?.src || o.imagemReserva, precoCheio: cheio, precoAtual: atual, encontrado: true };
  });
}

export const chaveVoto = (e: EscolaDuelo) => `bf2026:voto:${e}`;

export async function placarDuelo(): Promise<Record<EscolaDuelo, number>> {
  const [b, v] = await Promise.all([kvGet<number>(chaveVoto('beija-flor')), kvGet<number>(chaveVoto('viradouro'))]).catch(() => [0, 0]);
  return { 'beija-flor': Number(b) || 0, viradouro: Number(v) || 0 };
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
