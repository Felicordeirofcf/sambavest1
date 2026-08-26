// Configuração de Tipagem e Integração de Frete (Melhor Envio / Sistema)

export const FREE_SHIPPING_THRESHOLD = 300; // Ajuste o valor do frete grátis conforme sua preferência

export type ShippingQuote = {
  id: number | string;
  name: string;
  price: number;
  delivery_time: number;
  minDays: number;
  maxDays: number;
  region: string;
  company_picture?: string;
};

/**
 * Valida se um CEP possui 8 dígitos numéricos válidos (com ou sem hífen).
 */
export function isValidCep(cep: string): boolean {
  if (!cep) return false;
  return /^\d{5}-?\d{3}$/.test(cep.trim());
}

/**
 * Função utilitária para calcular frete via API interna do Melhor Envio / Next.js
 */
async function fetchMelhorEnvioQuotes(cep: string, items: any[]): Promise<ShippingQuote[]> {
  try {
    const response = await fetch('/api/shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cep, items }),
    });

    const data = await response.json();

    if (data.success && data.quotes && data.quotes.length > 0) {
      return data.quotes.map((q: any) => ({
        id: q.id,
        name: q.name,
        price: Number(q.price),
        delivery_time: q.delivery_time,
        minDays: q.delivery_time,
        maxDays: q.delivery_time + 2, // Margem de segurança de dias úteis
        region: 'Nacional',
        company_picture: q.company_picture
      }));
    }
    return [];
  } catch (error) {
    console.error('Erro ao buscar cotações de frete:', error);
    return [];
  }
}