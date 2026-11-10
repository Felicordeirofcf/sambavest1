// Cotação de frete no Melhor Envio — usada pela calculadora (/api/shipping) e,
// no servidor, pelo checkout, que refaz a cotação para não confiar no valor vindo do navegador.
//
// Usa o mesmo pacote da etiqueta (lib/automacao/melhorenvio.ts → pacote(), medidas e peso em
// lib/automacao/config.ts), o mesmo cliente da API (sandbox e MELHOR_ENVIO_USER_AGENT) e só os
// serviços de MELHOR_ENVIO_SERVICOS.
import { config } from './automacao/config';
import { me, pacote } from './automacao/melhorenvio';

import { FREE_SHIPPING_THRESHOLD } from './shipping';

// Mesmo valor mostrado no site (lib/shipping.ts).
export const FRETE_GRATIS_A_PARTIR_DE = FREE_SHIPPING_THRESHOLD;

export type CotacaoFrete = {
  id: number;
  name: string;
  price: number;
  delivery_time: number;
  company_picture?: string;
};

export async function cotarFrete(
  cep: string,
  itens: { quantity: number; price: number }[]
): Promise<CotacaoFrete[]> {
  const cepOrigem = (config.melhorEnvio.remetente.cep || '').replace(/\D/g, '');
  if (!config.melhorEnvio.token || !cepOrigem) {
    throw new Error('Faltam credenciais do Melhor Envio (MELHOR_ENVIO_TOKEN / CEP_ORIGEM).');
  }

  const totalItens = itens.reduce((acc, item) => acc + Number(item.quantity || 0), 0);
  const valorTotal = itens.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const servicos = config.melhorEnvio.servicos;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await me<any[]>('/me/shipment/calculate', {
    method: 'POST',
    body: {
      from: { postal_code: cepOrigem },
      to: { postal_code: String(cep).replace(/\D/g, '') },
      // Um único pacote com todas as peças — o mesmo que vai para a etiqueta.
      package: pacote(totalItens),
      options: { insurance_value: Number(valorTotal.toFixed(2)), receipt: false, own_hand: false },
      ...(servicos.length ? { services: servicos.join(',') } : {}),
    },
  });
  if (!Array.isArray(data)) {
    console.error('Erro Melhor Envio:', data);
    throw new Error('Falha ao calcular frete no Melhor Envio');
  }

  return data
    .filter((cotacao) => !cotacao.error && cotacao.price)
    .map((cotacao) => ({
      id: Number(cotacao.id),
      name: `${cotacao.company?.name} - ${cotacao.name}`, // Ex: "Correios - PAC"
      price: Number(cotacao.price),
      delivery_time: Number(cotacao.delivery_time),
      company_picture: cotacao.company?.picture,
    }))
    .sort((a, b) => a.price - b.price);
}

/** Mesma regra da calculadora: PAC grátis quando os produtos somam R$ 300 ou mais. */
export function freteGratis(cotacao: CotacaoFrete, subtotalProdutos: number): boolean {
  return subtotalProdutos >= FRETE_GRATIS_A_PARTIR_DE && cotacao.name.toLowerCase().includes('pac');
}
