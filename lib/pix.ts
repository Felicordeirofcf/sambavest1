// Desconto do Pix. Durante a Black Friday não há desconto no Pix (o preço já é o da Black);
// fora dela, 10%. Usado pelo checkout no servidor (que é quem vale) e pelas telas.
import { faseBF } from './blackfridayPeriodo';

export const DESCONTO_PIX_PADRAO = 0.1;

export function descontoPixAtual(agora = Date.now()): number {
  return faseBF(agora) === 'durante' ? 0 : DESCONTO_PIX_PADRAO;
}
