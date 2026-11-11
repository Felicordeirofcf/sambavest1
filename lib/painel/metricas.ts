// Cálculos do painel (funções puras sobre PedidoResumo).
import { chaveTelefone, telefoneWhatsapp } from '../automacao/whatsapp';
import { PedidoResumo, STATUS_PAGO } from './dados';

const DIA = 86_400_000;

/** Minúsculas e sem acento, para buscas ("fabio" acha "Fábio"). */
export function norm(t: string): string {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
export const fuso = 'America/Sao_Paulo';

export const pago = (p: PedidoResumo) => STATUS_PAGO.includes(p.status);
export const ehPix = (p: PedidoResumo) => p.metodo.includes('pix');

/** AAAA-MM-DD no fuso de São Paulo. */
export function diaLocal(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: fuso });
}

export type Resumo = {
  faturamento: number;
  pedidosPagos: number;
  ticketMedio: number;
  pecas: number;
  pedidosCriados: number;
  taxaPagamento: number; // pagos / (criados que não são rascunho)
  pixGerados: number;
  pixPagos: number;
  frete: number;
  descontos: number;
};

export function resumo(pedidos: PedidoResumo[]): Resumo {
  const pagos = pedidos.filter(pago);
  const faturamento = pagos.reduce((s, p) => s + p.total, 0);
  const pix = pedidos.filter(ehPix);
  return {
    faturamento,
    pedidosPagos: pagos.length,
    ticketMedio: pagos.length ? faturamento / pagos.length : 0,
    pecas: pagos.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.qtd, 0), 0),
    pedidosCriados: pedidos.length,
    taxaPagamento: pedidos.length ? pagos.length / pedidos.length : 0,
    pixGerados: pix.length,
    pixPagos: pix.filter(pago).length,
    frete: pagos.reduce((s, p) => s + p.frete, 0),
    descontos: pagos.reduce((s, p) => s + p.desconto, 0),
  };
}

/** Separa a lista (2× o período) em período atual e anterior. */
export function periodos(pedidos: PedidoResumo[], dias: number, agora = Date.now()) {
  const inicio = agora - dias * DIA;
  const inicioAnterior = agora - 2 * dias * DIA;
  return {
    atual: pedidos.filter((p) => p.criado >= inicio),
    anterior: pedidos.filter((p) => p.criado >= inicioAnterior && p.criado < inicio),
  };
}

export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / anterior;
}

export type PontoDia = { dia: string; faturamento: number; pedidos: number };

export function seriePorDia(pedidos: PedidoResumo[], dias: number, agora = Date.now()): PontoDia[] {
  const mapa = new Map<string, PontoDia>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = diaLocal(agora - i * DIA);
    mapa.set(d, { dia: d, faturamento: 0, pedidos: 0 });
  }
  for (const p of pedidos.filter(pago)) {
    const ponto = mapa.get(diaLocal(p.criado));
    if (ponto) {
      ponto.faturamento += p.total;
      ponto.pedidos += 1;
    }
  }
  return [...mapa.values()];
}

export type Fatia = { nome: string; valor: number; qtd: number };

export function porMetodo(pedidos: PedidoResumo[]): Fatia[] {
  const mapa = new Map<string, Fatia>();
  for (const p of pedidos.filter(pago)) {
    const nome = ehPix(p) ? 'Pix' : p.metodo.includes('credit') || p.metodo.includes('card') ? 'Cartão' : p.metodoNome;
    const f = mapa.get(nome) || { nome, valor: 0, qtd: 0 };
    f.valor += p.total;
    f.qtd += 1;
    mapa.set(nome, f);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

export function porUf(pedidos: PedidoResumo[], limite = 8): Fatia[] {
  const mapa = new Map<string, Fatia>();
  for (const p of pedidos.filter(pago)) {
    const nome = p.cliente.uf || '—';
    const f = mapa.get(nome) || { nome, valor: 0, qtd: 0 };
    f.valor += p.total;
    f.qtd += 1;
    mapa.set(nome, f);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, limite);
}

/** Nome do produto sem a variação ("Camisa X - M" → "Camisa X"). */
export function nomeBase(nome: string): string {
  return nome.replace(/\s+-\s+[^-]+$/, '').trim();
}

export function topProdutos(pedidos: PedidoResumo[], limite = 10): Fatia[] {
  const mapa = new Map<string, Fatia>();
  for (const p of pedidos.filter(pago)) {
    for (const i of p.itens) {
      const nome = nomeBase(i.nome);
      const f = mapa.get(nome) || { nome, valor: 0, qtd: 0 };
      f.valor += i.total;
      f.qtd += i.qtd;
      mapa.set(nome, f);
    }
  }
  return [...mapa.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor).slice(0, limite);
}

/** Vendas por variação (SKU) — para cruzar com o estoque. */
export function vendasPorVariacao(pedidos: PedidoResumo[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const p of pedidos.filter(pago)) {
    for (const i of p.itens) {
      const id = i.variacao || i.produto;
      mapa.set(id, (mapa.get(id) || 0) + i.qtd);
    }
  }
  return mapa;
}

// ---------- Pendências (o que precisa de ação) ----------

export type Pendencia = { tipo: string; titulo: string; pedidos: PedidoResumo[]; dica: string };

export function pendencias(
  pedidos: PedidoResumo[],
  opcoes: { bling: boolean; envios: boolean },
  agora = Date.now()
): Pendencia[] {
  const horas = (p: PedidoResumo) => (agora - (p.pago || p.criado)) / 3_600_000;
  const recentes = pedidos.filter((p) => agora - p.criado < 15 * DIA);
  const lista: Pendencia[] = [
    {
      tipo: 'erro',
      titulo: 'Pedidos com erro na automação',
      pedidos: recentes.filter((p) => p.marcas.erro && p.status !== 'cancelled'),
      dica: 'Abra o pedido para ver o erro e clique em "Rodar automações de novo".',
    },
    {
      tipo: 'envio',
      titulo: 'Pagos há mais de 2 dias sem rastreio',
      pedidos: pedidos.filter((p) => p.status === 'processing' && !p.marcas.rastreio && horas(p) > 48),
      dica: 'Poste a encomenda ou informe o código de rastreio no pedido.',
    },
    {
      tipo: 'pix',
      titulo: 'Pix gerado e não pago (últimas 48h)',
      pedidos: pedidos.filter((p) => p.status === 'pending' && ehPix(p) && horas(p) > 1 && horas(p) < 48),
      dica: 'Vale um contato pelo WhatsApp: costuma recuperar parte dessas vendas.',
    },
  ];
  if (opcoes.bling) {
    lista.push({
      tipo: 'bling',
      titulo: 'Pagos sem pedido no Bling',
      pedidos: recentes.filter((p) => pago(p) && !p.marcas.bling && horas(p) > 1),
      dica: 'A rotina tenta de novo a cada 30 min; se persistir, veja o erro no pedido.',
    });
  }
  if (opcoes.envios) {
    lista.push({
      tipo: 'me',
      titulo: 'Pagos sem envio no Melhor Envio',
      pedidos: recentes.filter((p) => p.status === 'processing' && !p.marcas.envio && !p.marcas.rastreio && horas(p) > 1),
      dica: 'Confira o carrinho do Melhor Envio ou o erro no pedido.',
    });
  }
  return lista.filter((x) => x.pedidos.length > 0);
}

// ---------- CRM: clientes ----------

export type Segmento = 'VIP' | 'Recorrente' | 'Novo' | 'Inativo' | 'Não comprou';

export type Cliente = {
  chave: string;
  nome: string;
  email: string;
  telefone: string;
  whatsapp: string | null;
  documento: string;
  cidade: string;
  uf: string;
  pedidos: PedidoResumo[]; // todos, do mais novo para o mais antigo
  pagos: number;
  gasto: number;
  primeiraCompra: number | null;
  ultimaCompra: number | null;
  ultimoContato: number;
  segmento: Segmento;
};

export function chaveCliente(p: PedidoResumo): string {
  if (p.cliente.documento.length >= 11) return `doc-${p.cliente.documento}`;
  if (p.cliente.email) return `email-${p.cliente.email}`;
  const tel = chaveTelefone(p.cliente.telefone);
  return tel ? `tel-${tel}` : `pedido-${p.id}`;
}

export const VIP_GASTO = 600;

function segmentar(c: Omit<Cliente, 'segmento'>, agora: number): Segmento {
  if (c.pagos === 0) return 'Não comprou';
  if (c.ultimaCompra && agora - c.ultimaCompra > 120 * DIA) return 'Inativo';
  if (c.gasto >= VIP_GASTO || c.pagos >= 3) return 'VIP';
  if (c.pagos >= 2) return 'Recorrente';
  return 'Novo';
}

export function clientes(pedidos: PedidoResumo[], agora = Date.now()): Cliente[] {
  const mapa = new Map<string, PedidoResumo[]>();
  for (const p of pedidos) {
    const k = chaveCliente(p);
    mapa.set(k, [...(mapa.get(k) || []), p]);
  }
  const lista: Cliente[] = [];
  for (const [chave, ps] of mapa) {
    ps.sort((a, b) => b.criado - a.criado);
    const recente = ps[0];
    const pagosLista = ps.filter(pago);
    const base = {
      chave,
      nome: recente.cliente.nome,
      email: recente.cliente.email,
      telefone: recente.cliente.telefone,
      whatsapp: telefoneWhatsapp(recente.cliente.telefone),
      documento: recente.cliente.documento,
      cidade: recente.cliente.cidade,
      uf: recente.cliente.uf,
      pedidos: ps,
      pagos: pagosLista.length,
      gasto: pagosLista.reduce((s, p) => s + p.total, 0),
      primeiraCompra: pagosLista.length ? pagosLista[pagosLista.length - 1].criado : null,
      ultimaCompra: pagosLista.length ? pagosLista[0].criado : null,
      ultimoContato: recente.criado,
    };
    lista.push({ ...base, segmento: segmentar(base, agora) });
  }
  return lista.sort((a, b) => b.ultimoContato - a.ultimoContato);
}
