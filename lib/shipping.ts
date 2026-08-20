// Cálculo de frete por estimativa regional (sem depender de uma API de transportadora
// configurada). Funciona 100% offline, então roda de primeira quando você testar o site.
//
// Quando quiser frete real (Correios, Melhor Envio, Jadlog etc.), troque a lógica de
// calculateShipping por uma chamada à API do provedor escolhido — a assinatura da
// função (recebe um CEP, devolve preço + prazo) pode continuar a mesma.

export const FREE_SHIPPING_THRESHOLD = 250;

export type ShippingQuote = {
  price: number;
  minDays: number;
  maxDays: number;
  region: string;
};

// Faixas de CEP por região (primeiro dígito do CEP) — valores estimados, ajuste
// livremente para bater com o seu custo real de envio.
const REGIONS: Record<string, { name: string; price: number; minDays: number; maxDays: number }> = {
  '0': { name: 'São Paulo (capital e região)', price: 19.9, minDays: 2, maxDays: 4 },
  '1': { name: 'São Paulo (interior)', price: 22.9, minDays: 3, maxDays: 5 },
  '2': { name: 'Rio de Janeiro / Espírito Santo', price: 14.9, minDays: 2, maxDays: 4 },
  '3': { name: 'Minas Gerais', price: 22.9, minDays: 3, maxDays: 5 },
  '4': { name: 'Bahia / Sergipe', price: 27.9, minDays: 5, maxDays: 8 },
  '5': { name: 'Pernambuco / Alagoas / Paraíba / Rio Grande do Norte', price: 29.9, minDays: 5, maxDays: 9 },
  '6': { name: 'Ceará / Piauí / Maranhão / Norte', price: 32.9, minDays: 6, maxDays: 10 },
  '7': { name: 'Distrito Federal / Goiás / Tocantins / Centro-Oeste', price: 26.9, minDays: 4, maxDays: 7 },
  '8': { name: 'Paraná / Santa Catarina', price: 24.9, minDays: 3, maxDays: 6 },
  '9': { name: 'Rio Grande do Sul', price: 27.9, minDays: 4, maxDays: 7 },
};

export function isValidCep(cep: string): boolean {
  return /^\d{5}-?\d{3}$/.test(cep.trim());
}

/**
 * Calcula o frete estimado a partir de um CEP e do subtotal do carrinho.
 * Retorna null se o CEP for inválido.
 */
export function calculateShipping(cep: string, subtotal: number): ShippingQuote | null {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;

  const region = REGIONS[clean[0]];
  if (!region) return null;

  const free = subtotal >= FREE_SHIPPING_THRESHOLD;

  return {
    price: free ? 0 : region.price,
    minDays: region.minDays,
    maxDays: region.maxDays,
    region: region.name,
  };
}
