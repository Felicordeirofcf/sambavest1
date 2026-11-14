// Conhecimento da loja que a IA do WhatsApp pode afirmar (além do que vem das ferramentas).
//
// Por que fica aqui, em código, e não só na variável WHATSAPP_IA_CONHECIMENTO?
//  - Tabela de medidas é grande e precisa de formatação: numa variável de ambiente vira uma linha só,
//    difícil de revisar. Aqui ela é versionada (dá para ver no PR o que a IA "sabe").
//  - Regras que já existem no site (desconto do Pix, frete grátis, Black Friday) são calculadas
//    das MESMAS constantes que o checkout usa: se o site mudar, a IA muda junto, sem risco de
//    a IA prometer uma coisa e o checkout cobrar outra.
//  - A variável WHATSAPP_IA_CONHECIMENTO continua valendo para acrescentar avisos rápidos
//    (ex.: "loja fechada no feriado") sem precisar de deploy.
//
// Fonte das medidas: tabelas publicadas no site (public/products/tabela-tamanhos*.jpg e
// guia-tamanhos-beija-flor-2027.webp). Todas as linhas de camisa usam a mesma grade.
import { DESCONTO_PIX_PADRAO } from '../pix';
import { FRETE_GRATIS_A_PARTIR_DE } from '../frete';
import { faseBF, PERIODO_BF } from '../blackfridayPeriodo';
import { config } from './config';

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const data = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export const MEDIDAS = `MEDIDAS (centímetros, peça esticada na mesa; podem variar até 2 cm para mais ou para menos). Material: 100% poliéster.
- Camisa Unissex/Masculina (básica) — largura (de axila a axila) x altura (do ombro à barra): P 50x67 | M 53x67 | G 59x73 | GG 62x76 | XGG 65x84 | EXG 71x92
- Regata Unissex (sem mangas) — largura x altura: P 50x67 | M 53x67 | G 59x73 | GG 62x76 | XGG 65x84
- Baby look (feminina) — largura x altura: P 40x61 | M 42x62 | G 43x63 | GG 45x65 | XGG 47x68
- Vestido (feminino) — peito / cintura / quadril / altura (da alça à barra): P 39/37/46/80 | M 40/38/48/83 | G 42/44/52/87 | GG 47/45/54/90
COMO AJUDAR NO TAMANHO: peça para o cliente medir, deitada na mesa, uma camisa dele que vista bem (de axila a axila) e compare com a largura da tabela. Se ficar entre dois tamanhos, sugira o maior para um caimento mais solto. Não chute tamanho por altura/peso: se o cliente só tiver altura e peso, explique como medir uma camisa dele; se mesmo assim ele não conseguir, transfira para uma pessoa.`;

/** Pagamento, frete e Black Friday, calculados das mesmas regras do checkout. */
export function regrasComerciais(agora = Date.now()): string {
  const black = faseBF(agora) === 'durante';
  const pix = black
    ? 'Pix (aprovação na hora) ou cartão de crédito. Durante a Black Friday não há desconto extra no Pix: o preço da Black já é o preço final.'
    : `Pix (aprovação na hora, com ${Math.round(DESCONTO_PIX_PADRAO * 100)}% de desconto no site) ou cartão de crédito.`;
  return [
    `PAGAMENTO: ${pix} Parcelamento: não informe número de parcelas nem juros (aparece na hora de pagar no cartão); se o cliente insistir, transfira. Não há boleto.`,
    `FRETE: calculado no carrinho/checkout pelo CEP, para todo o Brasil. Compras acima de ${brl(FRETE_GRATIS_A_PARTIR_DE)} em produtos têm o frete mais barato grátis. Não informe valor de frete: peça para calcular no site com o CEP.`,
    black
      ? `BLACK FRIDAY (até ${data(PERIODO_BF.fim)}): camisas da Black com preço promocional, válido até ${data(PERIODO_BF.fim)} ou enquanto durar o estoque. Página: ${config.siteUrl}/black-friday . Use buscar_produtos para o preço de cada camisa.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
