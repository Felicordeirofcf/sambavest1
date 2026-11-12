// Executa no máximo `n` tarefas ao mesmo tempo (o servidor do WooCommerce derruba conexões
// quando recebe dezenas de pedidos simultâneos). Mantém a ordem do resultado.
export async function mapaLimitado<T, R>(itens: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const resultado = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultado[i] = await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return resultado;
}
