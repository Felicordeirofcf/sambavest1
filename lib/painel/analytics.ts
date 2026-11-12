// Cálculos da visão geral "ao vivo" do painel (funções puras sobre os pedidos e o estoque).
import { diasAteFimBF, PERIODO_BF } from '../blackfridayPeriodo';
import type { LinhaEstoque, PedidoResumo } from './dados';
import { diaLocal, ehPix, nomeBase, norm, pago } from './metricas';

const DIA = 86_400_000;
const fuso = 'America/Sao_Paulo';

/** Momento em que o pedido virou venda (pago; sem data de pagamento, a criação). */
export const quando = (p: PedidoResumo) => p.pago || p.criado;

/** Minutos desde a meia-noite em São Paulo. */
function minutosDoDia(ms: number): number {
  const [h, m] = new Date(ms).toLocaleTimeString('en-GB', { timeZone: fuso, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return (h % 24) * 60 + m;
}

export type Metricas = { vendas: number; faturamento: number; ticket: number; pecas: number };

function metricas(lista: PedidoResumo[]): Metricas {
  const faturamento = lista.reduce((s, p) => s + p.total, 0);
  return {
    vendas: lista.length,
    faturamento,
    ticket: lista.length ? faturamento / lista.length : 0,
    pecas: lista.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.qtd, 0), 0),
  };
}

/** Hoje × ontem até a mesma hora (comparação justa durante o dia). */
export function hojeVsOntem(pedidos: PedidoResumo[], agora: number) {
  const pagos = pedidos.filter(pago);
  const hoje = diaLocal(agora);
  const ontem = diaLocal(agora - DIA);
  const ateAgora = minutosDoDia(agora);
  return {
    hoje: metricas(pagos.filter((p) => diaLocal(quando(p)) === hoje)),
    ontem: metricas(pagos.filter((p) => diaLocal(quando(p)) === ontem && minutosDoDia(quando(p)) <= ateAgora)),
  };
}

/** Últimos `n` dias (AAAA-MM-DD), do mais antigo para hoje. */
export function ultimosDias(n: number, agora: number): string[] {
  return Array.from({ length: n }, (_, i) => diaLocal(agora - (n - 1 - i) * DIA));
}

/** Métricas por dia, para as minis-linhas dos cards. */
export function seriesDiarias(pedidos: PedidoResumo[], dias: string[]): Metricas[] {
  const pagos = pedidos.filter(pago);
  return dias.map((d) => metricas(pagos.filter((p) => diaLocal(quando(p)) === d)));
}

export type Coluna = { chave: string; rotulo: string; valor: number; detalhe: string };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function colunasPorDia(pedidos: PedidoResumo[], dias: string[]): Coluna[] {
  return seriesDiarias(pedidos, dias).map((m, i) => {
    const [, mes, dia] = dias[i].split('-');
    return { chave: dias[i], rotulo: `${dia}/${mes}`, valor: m.faturamento, detalhe: `${dia}/${mes}: ${brl(m.faturamento)} · ${m.vendas} venda(s)` };
  });
}

export function colunasPorHora(pedidos: PedidoResumo[], agora: number): Coluna[] {
  const hoje = diaLocal(agora);
  const pagos = pedidos.filter((p) => pago(p) && diaLocal(quando(p)) === hoje);
  const horaAgora = Math.floor(minutosDoDia(agora) / 60);
  return Array.from({ length: horaAgora + 1 }, (_, h) => {
    const daHora = pagos.filter((p) => Math.floor(minutosDoDia(quando(p)) / 60) === h);
    const m = metricas(daHora);
    return { chave: String(h), rotulo: `${h}h`, valor: m.faturamento, detalhe: `${h}h–${h + 1}h: ${brl(m.faturamento)} · ${m.vendas} venda(s)` };
  });
}

// ---------- Black Friday ----------

export function blackFriday(pedidos: PedidoResumo[], estoque: LinhaEstoque[] | null, agora: number) {
  const desde = PERIODO_BF.inicio.getTime();
  const pagosBF = pedidos.filter((p) => pago(p) && quando(p) >= desde && quando(p) <= PERIODO_BF.fim.getTime());
  const m = metricas(pagosBF);
  // Meta = vender todo o estoque: o que já saiu na Black + o que ainda está no WooCommerce
  const restante = estoque
    ? estoque.filter((l) => l.gerencia && typeof l.quantidade === 'number' && l.quantidade > 0).reduce((s, l) => s + (l.quantidade as number), 0)
    : null;
  const meta = restante === null ? null : m.pecas + restante;
  const diasRestantes = diasAteFimBF(agora);
  const diasPassados = Math.max(1, Math.ceil((Math.min(agora, PERIODO_BF.fim.getTime()) - desde) / DIA));
  const ritmo = m.pecas / diasPassados;
  // Ritmo necessário para zerar o estoque até o fim
  // hoje conta como dia de venda
  const necessario = restante !== null ? restante / (diasRestantes + 1) : null;
  return { ...m, restante, meta, diasRestantes, ritmo, necessario, pedidos: pagosBF };
}

export type LadoDuelo = { votos: number; pecas: number; faturamento: number };

export function dueloVendas(pagosBF: PedidoResumo[]): { 'beija-flor': Omit<LadoDuelo, 'votos'>; viradouro: Omit<LadoDuelo, 'votos'> } {
  const r = { 'beija-flor': { pecas: 0, faturamento: 0 }, viradouro: { pecas: 0, faturamento: 0 } };
  for (const p of pagosBF) {
    for (const i of p.itens) {
      const n = norm(i.nome);
      const lado = n.includes('beija') ? 'beija-flor' : n.includes('viradouro') ? 'viradouro' : null;
      if (!lado) continue;
      r[lado].pecas += i.qtd;
      r[lado].faturamento += i.total;
    }
  }
  return r;
}

// ---------- Rankings ----------

export type Item = { nome: string; qtd: number; valor: number; extra?: string };

export function rankingCamisas(pagos: PedidoResumo[], limite = 6): Item[] {
  const mapa = new Map<string, Item>();
  for (const p of pagos)
    for (const i of p.itens) {
      const nome = nomeBase(i.nome);
      const it = mapa.get(nome) || { nome, qtd: 0, valor: 0 };
      it.qtd += i.qtd;
      it.valor += i.total;
      mapa.set(nome, it);
    }
  return [...mapa.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor).slice(0, limite);
}

const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EXG', 'G1', 'G2', 'G3', 'G4', 'U', 'ÚNICO'];

/** Tamanho de um item: pela variação no estoque ou pelo fim do nome ("Camisa X - Unisex, M"). */
function tamanhoDe(nome: string, variacao: number, porVariacao: Map<number, string>): string {
  const texto = porVariacao.get(variacao) || nome.split(' - ').slice(1).join(' ');
  const partes = texto.split(/\s*[/,]\s*/).map((s) => s.trim().toUpperCase());
  return partes.reverse().find((p) => TAMANHOS.includes(p)) || '—';
}

export function rankingTamanhos(pagos: PedidoResumo[], estoque: LinhaEstoque[] | null): Item[] {
  const porVariacao = new Map((estoque || []).map((l) => [l.variacaoId, l.variacao]));
  const mapa = new Map<string, Item>();
  for (const p of pagos)
    for (const i of p.itens) {
      const t = tamanhoDe(i.nome, i.variacao, porVariacao);
      const it = mapa.get(t) || { nome: t, qtd: 0, valor: 0 };
      it.qtd += i.qtd;
      it.valor += i.total;
      mapa.set(t, it);
    }
  return [...mapa.values()].sort((a, b) => b.qtd - a.qtd);
}

/** Variações com estoque que devem acabar primeiro, pelo ritmo de vendas dos últimos 7 dias. */
export function acabandoPrimeiro(pedidos: PedidoResumo[], estoque: LinhaEstoque[], agora: number, limite = 6) {
  const vendidos = new Map<number, number>();
  for (const p of pedidos.filter((x) => pago(x) && quando(x) >= agora - 7 * DIA))
    for (const i of p.itens) {
      const id = i.variacao || i.produto;
      vendidos.set(id, (vendidos.get(id) || 0) + i.qtd);
    }
  return estoque
    .filter((l) => l.gerencia && typeof l.quantidade === 'number' && l.quantidade >= 0)
    .map((l) => {
      const porDia = (vendidos.get(l.variacaoId || l.produtoId) || 0) / 7;
      const q = l.quantidade as number;
      return { ...l, q, porDia, dias: q === 0 ? 0 : porDia > 0 ? q / porDia : Infinity };
    })
    .filter((l) => l.q === 0 || l.porDia > 0 || l.q < 3)
    .sort((a, b) => a.dias - b.dias || a.q - b.q)
    .slice(0, limite);
}

// ---------- Mapa ----------

export function porEstado(pagos: PedidoResumo[]): Map<string, { qtd: number; valor: number }> {
  const mapa = new Map<string, { qtd: number; valor: number }>();
  for (const p of pagos) {
    const uf = p.cliente.uf || '—';
    const v = mapa.get(uf) || { qtd: 0, valor: 0 };
    v.qtd += 1;
    v.valor += p.total;
    mapa.set(uf, v);
  }
  return mapa;
}

// ---------- Pix pendentes ----------

export function pixPendentes(pedidos: PedidoResumo[], agora: number): PedidoResumo[] {
  return pedidos.filter((p) => p.status === 'pending' && ehPix(p) && agora - p.criado < 2 * DIA).sort((a, b) => b.criado - a.criado);
}
