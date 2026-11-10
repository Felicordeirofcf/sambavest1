// Cotação de frete no Melhor Envio — usada pela calculadora (/api/shipping) e,
// no servidor, pelo checkout, que refaz a cotação para não confiar no valor vindo do navegador.

export const FRETE_GRATIS_A_PARTIR_DE = 300;

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
  const token = process.env.MELHOR_ENVIO_TOKEN;
  const cepOrigem = process.env.CEP_ORIGEM;
  if (!token || !cepOrigem) {
    throw new Error('Faltam credenciais do Melhor Envio (MELHOR_ENVIO_TOKEN / CEP_ORIGEM).');
  }

  const totalItens = itens.reduce((acc, item) => acc + Number(item.quantity || 0), 0);
  const valorTotal = itens.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 0), 0);

  // 1 pacote padronizado: 300g por camisa, caixa 20x15x10cm
  const payload = {
    from: { postal_code: cepOrigem },
    to: { postal_code: String(cep).replace(/\D/g, '') },
    products: [
      {
        id: 'camisas',
        weight: totalItens * 0.3,
        width: 20,
        height: 10,
        length: 15,
        insurance_value: valorTotal,
        quantity: 1,
      },
    ],
  };

  const response = await fetch('https://www.melhorenvio.com.br/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': process.env.MELHOR_ENVIO_USER_AGENT || 'Samba Vest',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok || !Array.isArray(data)) {
    console.error('Erro Melhor Envio:', data);
    throw new Error('Falha ao calcular frete no Melhor Envio');
  }

  return data
    .filter((cotacao: any) => !cotacao.error)
    .map((cotacao: any) => ({
      id: Number(cotacao.id),
      name: `${cotacao.company.name} - ${cotacao.name}`, // Ex: "Correios - PAC"
      price: Number(cotacao.price),
      delivery_time: cotacao.delivery_time,
      company_picture: cotacao.company.picture,
    }))
    .sort((a: CotacaoFrete, b: CotacaoFrete) => a.price - b.price);
}

/** Mesma regra da calculadora: PAC grátis quando os produtos somam R$ 300 ou mais. */
export function freteGratis(cotacao: CotacaoFrete, subtotalProdutos: number): boolean {
  return subtotalProdutos >= FRETE_GRATIS_A_PARTIR_DE && cotacao.name.toLowerCase().includes('pac');
}
