// Tabela de medidas das camisas (cm, peça esticada na mesa; variação de até 2 cm).
// Fonte: tabelas publicadas no site (public/products/tabela-tamanhos*.jpg e guia-tamanhos-beija-flor-2027.webp).
// Vale para todas as escolas (mesma grade de confecção).

export type TipoPeca = 'unissex' | 'regata' | 'babylook' | 'vestido';

export const MEDIDAS: Record<TipoPeca, { nome: string; colunas: string[]; tamanhos: Record<string, number[]> }> = {
  unissex: {
    nome: 'Camisa unissex/masculina',
    colunas: ['Largura', 'Altura'],
    tamanhos: { P: [50, 67], M: [53, 67], G: [59, 73], GG: [62, 76], XGG: [65, 84], EXG: [71, 92] },
  },
  regata: {
    nome: 'Regata',
    colunas: ['Largura', 'Altura'],
    tamanhos: { P: [50, 67], M: [53, 67], G: [59, 73], GG: [62, 76], XGG: [65, 84] },
  },
  babylook: {
    nome: 'Baby look',
    colunas: ['Largura', 'Altura'],
    tamanhos: { P: [40, 61], M: [42, 62], G: [43, 63], GG: [45, 65], XGG: [47, 68] },
  },
  vestido: {
    nome: 'Vestido',
    colunas: ['Peito', 'Cintura', 'Quadril', 'Altura'],
    tamanhos: { P: [39, 37, 46, 80], M: [40, 38, 48, 83], G: [42, 44, 52, 87], GG: [47, 45, 54, 90] },
  },
};

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Qual tabela usar para o modelo escolhido (ex.: "UNISEX", "Masculino", "Feminino", "Baby look"). */
export function tipoDoModelo(modelo: string, nomeProduto = ''): TipoPeca {
  const t = sem(`${modelo} ${modelo ? '' : nomeProduto}`);
  if (/vestido/.test(t)) return 'vestido';
  if (/regata/.test(t)) return 'regata';
  if (/baby|feminin/.test(t)) return 'babylook';
  return 'unissex';
}

/** Normaliza o tamanho da variação ("g", "G ", "EXGG"...) para a chave da tabela. */
export function chaveTamanho(tamanho: string): string {
  return tamanho.trim().toUpperCase();
}
