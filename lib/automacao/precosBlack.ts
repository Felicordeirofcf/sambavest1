// Coloca o preço da Black (precoBlack, ex.: R$ 99) em TODOS os modelos das camisas da Black
// (Unissex, Baby look, Regata, Vestido...), no WooCommerce, que é de onde o checkout tira o preço.
//
// Uso (GitHub Actions → tarefa):
//   precos-black          → simulação: só mostra o que mudaria
//   precos-black-aplicar  → aplica (preço promocional por variação, até o fim da Black)
// O fim da promoção copia o agendamento do modelo que já está na Black (ex.: Unissex); se não houver,
// usa o fim da campanha. O "preço normal" não muda.
import { OFERTAS, produtosBF } from '../blackfriday';
import { PERIODO_BF } from '../blackfridayPeriodo';
import { wc } from './woocommerce';

type Variacao = {
  id: number;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_to: string | null;
  attributes: { name: string; option: string }[];
};

const modeloDe = (v: Variacao) => v.attributes.find((a) => /modelo|tipo|model|style/i.test(a.name))?.option || 'Único';

// Data local da loja (o Woo interpreta date_on_sale_* no fuso da loja)
const fimPadrao = () => {
  const d = new Date(PERIODO_BF.fim.getTime() - 3 * 3_600_000); // UTC-3
  return `${d.toISOString().slice(0, 10)}T23:59:59`;
};

export async function precosBlack(aplicar: boolean): Promise<Record<string, unknown>> {
  const alvos = OFERTAS.filter((o) => o.id === 'beija-flor-enredo' || o.id === 'viradouro-enredo');
  const produtos = await produtosBF();
  const r: Record<string, unknown> = { modo: aplicar ? 'APLICADO' : 'simulação (nada foi alterado)' };

  for (const oferta of alvos) {
    const p = produtos.find((x) => x.id === oferta.id);
    if (!p?.wooId) {
      r[oferta.id] = 'produto não encontrado no WooCommerce';
      continue;
    }
    const preco = oferta.precoBlack.toFixed(2);
    const vs = await wc<Variacao[]>(`/products/${p.wooId}/variations?per_page=100`);
    // Agendamento do modelo que já está na Black, para todos terminarem juntos
    const referencia = vs.find((v) => Number(v.sale_price) === oferta.precoBlack && v.date_on_sale_to);
    const ate = referencia?.date_on_sale_to || fimPadrao();
    const de = referencia?.date_on_sale_from || null;

    const mudar: { id: number; sale_price: string; date_on_sale_from: string | null; date_on_sale_to: string }[] = [];
    const resumo: Record<string, { ja_na_black: number; vai_mudar: number; preco_normal_menor_que_black: number }> = {};
    for (const v of vs) {
      const m = modeloDe(v);
      resumo[m] ||= { ja_na_black: 0, vai_mudar: 0, preco_normal_menor_que_black: 0 };
      if (Number(v.regular_price) && Number(v.regular_price) <= oferta.precoBlack) {
        resumo[m].preco_normal_menor_que_black++;
        continue;
      }
      if (Number(v.sale_price) === oferta.precoBlack) {
        resumo[m].ja_na_black++;
        continue;
      }
      resumo[m].vai_mudar++;
      mudar.push({ id: v.id, sale_price: preco, date_on_sale_from: de, date_on_sale_to: ate });
    }

    if (aplicar && mudar.length) {
      for (let i = 0; i < mudar.length; i += 50) {
        await wc(`/products/${p.wooId}/variations/batch`, { method: 'POST', body: { update: mudar.slice(i, i + 50) } });
      }
    }
    r[oferta.id] = {
      produto: p.titulo,
      preco_black: `R$ ${preco.replace('.', ',')}`,
      promocao_ate: ate,
      variacoes: vs.length,
      [aplicar ? 'alteradas' : 'seriam_alteradas']: mudar.length,
      por_modelo: resumo,
    };
  }
  return r;
}
