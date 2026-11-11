// Financeiro do Bling (API v3): contas a receber e a pagar. Só leitura.
//
// Precisa dos escopos "Contas a Receber" e "Contas a Pagar" no aplicativo do Bling
// (e, para os nomes das categorias, "Categorias Financeiras"). Depois de incluir escopos,
// é preciso autorizar o aplicativo de novo.
import { bling } from '../automacao/bling';
import { kvGet, kvSet } from '../automacao/kv';
import { diaLocal } from './metricas';

export type Tipo = 'receber' | 'pagar';

export type Conta = {
  id: number;
  tipo: Tipo;
  situacao: number;
  vencimento: string; // AAAA-MM-DD
  valor: number;
  saldo?: number; // só no detalhe (contas a pagar)
  contatoId?: number;
  contato?: string;
  documento?: string;
  historico?: string;
  categoriaId?: number;
  categoria?: string;
  origem?: string; // ex.: "Pedido de venda 123"
  linkPix?: string;
  linkBoleto?: string;
  detalhado?: boolean; // contas a pagar: true quando o detalhe foi carregado
};

export const SITUACAO: Record<number, string> = {
  1: 'Em aberto',
  2: 'Quitada',
  3: 'Parcial',
  4: 'Devolvida',
  5: 'Cancelada',
  6: 'Devolvida parcial',
  7: 'Confirmada',
};
export const ABERTA = [1, 3];
export const QUITADA = [2, 7];

type ItemReceber = {
  id: number;
  situacao: number;
  vencimento: string;
  valor: number;
  contato?: { id: number; nome?: string; numeroDocumento?: string };
  linkQRCodePix?: string;
  linkBoleto?: string;
  origem?: { tipoOrigem?: string; numero?: string };
};
type ItemPagar = { id: number; situacao: number; vencimento: string; valor: number; contato?: { id: number } };
type DetalhePagar = { saldo?: number; historico?: string; numeroDocumento?: string; categoria?: { id: number } };

const somarDias = (dias: number) => diaLocal(Date.now() + dias * 86_400_000);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function paginar<T>(caminho: string, maxPaginas = 10): Promise<T[]> {
  const todos: T[] = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const sep = caminho.includes('?') ? '&' : '?';
    const r = await bling<{ data?: T[] }>(`${caminho}${sep}pagina=${pagina}&limite=100`);
    const lote = r.data || [];
    todos.push(...lote);
    if (lote.length < 100) break;
    await espera(350); // limite do Bling: 3 requisições por segundo
  }
  return todos;
}

function deReceber(i: ItemReceber): Conta {
  const tipos: Record<string, string> = { V: 'Pedido de venda', N: 'NF-e', E: 'NFC-e', C: 'Contrato', O: 'Ordem de serviço' };
  return {
    id: i.id,
    tipo: 'receber',
    situacao: Number(i.situacao),
    vencimento: i.vencimento,
    valor: Number(i.valor) || 0,
    contatoId: i.contato?.id,
    contato: i.contato?.nome,
    origem: i.origem?.numero ? `${tipos[i.origem.tipoOrigem || ''] || 'Origem'} ${i.origem.numero}` : undefined,
    linkPix: i.linkQRCodePix || undefined,
    linkBoleto: i.linkBoleto || undefined,
  };
}

function dePagar(i: ItemPagar): Conta {
  return {
    id: i.id,
    tipo: 'pagar',
    situacao: Number(i.situacao),
    vencimento: i.vencimento,
    valor: Number(i.valor) || 0,
    contatoId: i.contato?.id,
  };
}

async function nomeContato(id: number): Promise<string | undefined> {
  const chave = `painel:bling:contato:${id}`;
  const salvo = await kvGet<string>(chave).catch(() => null);
  if (salvo) return salvo;
  try {
    const r = await bling<{ data?: { nome?: string } }>(`/contatos/${id}`);
    const nome = r.data?.nome;
    if (nome) await kvSet(chave, nome, 30 * 86_400).catch(() => undefined);
    return nome;
  } catch {
    return undefined;
  }
}

async function categorias(): Promise<Map<number, string>> {
  const chave = 'painel:bling:categorias';
  const salvo = await kvGet<[number, string][]>(chave).catch(() => null);
  if (salvo) return new Map(salvo);
  try {
    const lista = await paginar<{ id: number; descricao: string }>('/categorias/receitas-despesas', 5);
    const pares = lista.map((c) => [c.id, c.descricao] as [number, string]);
    await kvSet(chave, pares, 86_400).catch(() => undefined);
    return new Map(pares);
  } catch {
    return new Map(); // sem o escopo de categorias: mostra só o ID
  }
}

export type Financeiro = {
  receber: Conta[]; // vencimento de 90 dias atrás a 90 dias à frente + vencidas em aberto mais antigas
  pagar: Conta[];
  recebidoNoMes: number;
  pagoNoMes: number;
  inicioMes: string;
  atualizadoEm: number;
  avisos: string[];
};

const CACHE_S = 15 * 60;
const MAX_DETALHES = 30;

export async function carregarFinanceiro(forcar = false): Promise<Financeiro> {
  const chave = 'painel:financeiro';
  if (!forcar) {
    const salvo = await kvGet<Financeiro>(chave).catch(() => null);
    if (salvo) return salvo;
  }
  const de = somarDias(-90);
  const ate = somarDias(90);
  const hoje = diaLocal(Date.now());
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const avisos: string[] = [];

  // Em sequência, por causa do limite de 3 requisições por segundo
  const receber = (await paginar<ItemReceber>(`/contas/receber?tipoFiltroData=V&dataInicial=${de}&dataFinal=${ate}`))
    .map(deReceber)
    .filter((c) => c.vencimento >= de && c.vencimento <= ate);
  const pagar = (await paginar<ItemPagar>(`/contas/pagar?dataVencimentoInicial=${de}&dataVencimentoFinal=${ate}`))
    .map(dePagar)
    .filter((c) => c.vencimento >= de && c.vencimento <= ate);

  // Vencidas em aberto ANTES da janela de 90 dias (contas antigas que nunca tiveram baixa).
  const antesDe = somarDias(-91);
  const ids = new Set([...receber, ...pagar].map((c) => `${c.tipo}-${c.id}`));
  const novas = (l: Conta[]) =>
    l.filter((c) => {
      const k = `${c.tipo}-${c.id}`;
      if (ids.has(k) || c.vencimento > antesDe || !ABERTA.includes(c.situacao)) return false;
      ids.add(k);
      return true;
    });
  try {
    receber.push(
      ...novas(
        (await paginar<ItemReceber>(`/contas/receber?situacoes[]=1&situacoes[]=3&tipoFiltroData=V&dataInicial=2015-01-01&dataFinal=${antesDe}`, 20)).map(deReceber)
      )
    );
    for (const situacao of ABERTA) {
      pagar.push(
        ...novas(
          (await paginar<ItemPagar>(`/contas/pagar?situacao=${situacao}&dataVencimentoInicial=2015-01-01&dataVencimentoFinal=${antesDe}`, 10)).map(dePagar)
        )
      );
    }
  } catch (e) {
    avisos.push(`Não consegui ler as contas vencidas há mais de 90 dias: ${(e as Error).message}`);
  }

  let recebidoNoMes = 0;
  let pagoNoMes = 0;
  try {
    const rec = await paginar<ItemReceber>(`/contas/receber?tipoFiltroData=R&dataInicial=${inicioMes}&dataFinal=${hoje}`, 5);
    recebidoNoMes = rec.filter((c) => QUITADA.includes(Number(c.situacao))).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const pag = await paginar<ItemPagar>(`/contas/pagar?dataPagamentoInicial=${inicioMes}&dataPagamentoFinal=${hoje}`, 5);
    pagoNoMes = pag.filter((c) => QUITADA.includes(Number(c.situacao))).reduce((s, c) => s + (Number(c.valor) || 0), 0);
  } catch (e) {
    avisos.push(`Não consegui ler o realizado do mês: ${(e as Error).message}`);
  }

  // Detalhe das contas a pagar (descrição, categoria, saldo) e nome do fornecedor:
  // primeiro as vencidas e em aberto, depois as do mês.
  const fimMes = `${hoje.slice(0, 7)}-31`;
  const ordem = (c: Conta) =>
    ABERTA.includes(c.situacao) && c.vencimento < hoje ? 0 : c.vencimento >= inicioMes && c.vencimento <= fimMes ? 1 : ABERTA.includes(c.situacao) ? 2 : 3;
  const prioridade = [...pagar]
    .filter((c) => c.situacao !== 5 && ordem(c) < 3)
    .sort((a, b) => ordem(a) - ordem(b) || a.vencimento.localeCompare(b.vencimento))
    .slice(0, MAX_DETALHES);
  const cats = await categorias();
  for (const c of prioridade) {
    try {
      const d = await bling<{ data?: DetalhePagar }>(`/contas/pagar/${c.id}`);
      c.saldo = d.data?.saldo !== undefined ? Number(d.data.saldo) : undefined;
      c.historico = d.data?.historico || undefined;
      c.documento = d.data?.numeroDocumento || undefined;
      c.categoriaId = d.data?.categoria?.id || undefined;
      c.categoria = c.categoriaId ? cats.get(c.categoriaId) || `Categoria ${c.categoriaId}` : undefined;
      c.detalhado = true;
    } catch {
      // segue sem o detalhe
    }
    if (c.contatoId) c.contato = await nomeContato(c.contatoId);
    await espera(350);
  }
  if (pagar.filter((c) => c.situacao !== 5).length > MAX_DETALHES) {
    avisos.push(`Mostrando descrição e fornecedor só das ${MAX_DETALHES} contas a pagar mais urgentes.`);
  }

  const resultado: Financeiro = { receber, pagar, recebidoNoMes, pagoNoMes, inicioMes, atualizadoEm: Date.now(), avisos };
  try {
    if (JSON.stringify(resultado).length < 900_000) await kvSet(chave, resultado, CACHE_S);
  } catch {
    // ignora
  }
  return resultado;
}

/** Valor que ainda falta (contas parciais usam o saldo, quando o Bling informa). */
export const emAberto = (c: Conta) => (c.situacao === 3 && c.saldo !== undefined ? c.saldo : c.valor);

export type Semana = { inicio: string; fim: string; entradas: number; saidas: number };

/** Projeção por semana (segunda a domingo) das contas em aberto, a partir de hoje. */
export function projecaoSemanal(f: Financeiro, semanas = 8, agora = Date.now()): { vencidas: Semana; semanas: Semana[] } {
  const hoje = diaLocal(agora);
  const diaSemana = (new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
  const lista: Semana[] = [];
  for (let i = 0; i < semanas; i++) {
    const ini = diaLocal(agora + (i * 7 - diaSemana) * 86_400_000);
    const fim = diaLocal(agora + (i * 7 - diaSemana + 6) * 86_400_000);
    lista.push({ inicio: i === 0 ? hoje : ini, fim, entradas: 0, saidas: 0 });
  }
  const vencidas: Semana = { inicio: '', fim: '', entradas: 0, saidas: 0 };
  const abertas = [...f.receber, ...f.pagar].filter((c) => ABERTA.includes(c.situacao));
  for (const c of abertas) {
    const alvo = c.vencimento < hoje ? vencidas : lista.find((s) => c.vencimento >= s.inicio && c.vencimento <= s.fim);
    if (!alvo) continue;
    if (c.tipo === 'receber') alvo.entradas += emAberto(c);
    else alvo.saidas += emAberto(c);
  }
  return { vencidas, semanas: lista };
}
