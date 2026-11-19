import { kvGet, kvSet } from './kv';

/**
 * Nome oficial (IBGE) do município a partir do CEP, via ViaCEP.
 * A NF-e precisa do código do município, e o Bling só acha esse código se o nome
 * bater com o oficial (ex.: o cliente digita "Santana do Livramento", o IBGE usa
 * "Sant'Ana do Livramento"). Se a consulta falhar, devolve a cidade digitada.
 */
export async function municipioOficial(cep: string, cidade: string, uf: string): Promise<string> {
  const so = (cep || '').replace(/\D/g, '');
  if (so.length !== 8) return cidade;
  const chave = `cep:municipio:${so}`;
  const salvo = await kvGet<string>(chave).catch(() => null);
  if (salvo) return salvo;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${so}/json/`, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!res.ok) return cidade;
    const j = (await res.json()) as { erro?: boolean | string; localidade?: string; uf?: string };
    if (j.erro || !j.localidade) return cidade;
    if (uf && j.uf && j.uf.toUpperCase() !== uf.toUpperCase()) return cidade; // CEP de outro estado: não arrisca
    await kvSet(chave, j.localidade, 30 * 86_400).catch(() => undefined);
    return j.localidade;
  } catch {
    return cidade;
  }
}
