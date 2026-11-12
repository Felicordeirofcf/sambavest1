// Saúde da loja: a cada execução do cron (15 min) testa o que precisa funcionar para vender.
// Se algo falhar 2 vezes seguidas (~30 min), manda alerta no celular; quando voltar, avisa de novo.
//
// Observação: se a Vercel inteira cair, este teste também não roda. Para esse caso, ligue no
// cron-job.org o aviso por e-mail de falha da tarefa (Settings → Notifications).
import { alertarCelular } from './alertas';
import { config, integracoes } from './config';
import { kvGet, kvSet } from './kv';
import { wc } from './woocommerce';

export type Checagem = { nome: string; ok: boolean; ms: number; detalhe: string };
type Estado = Record<string, { falhas: number; desde?: number; alertado?: boolean }>;

const CHAVE_ESTADO = 'saude:estado';
const CHAVE_ULTIMO = 'saude:ultimo';

async function medir(nome: string, fn: () => Promise<string>): Promise<Checagem> {
  const t = Date.now();
  try {
    const detalhe = await fn();
    return { nome, ok: true, ms: Date.now() - t, detalhe };
  } catch (e) {
    return { nome, ok: false, ms: Date.now() - t, detalhe: ((e as Error).message || String(e)).slice(0, 200) };
  }
}

/** Testa loja, WooCommerce, frete e banco rápido. */
export async function verificarSaude(): Promise<Checagem[]> {
  const site = config.siteUrl.replace(/\/$/, '');
  const checks = await Promise.all([
    medir('Loja (sambavest.com)', async () => {
      const res = await fetch(`${site}/`, { cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'SambaVest-Saude/1.0' } });
      if (!res.ok) throw new Error(`a loja respondeu HTTP ${res.status}`);
      return `HTTP ${res.status}`;
    }),
    medir('WooCommerce', async () => {
      await wc('/products?per_page=1&_fields=id');
      return 'respondendo';
    }),
    integracoes.melhorEnvio()
      ? medir('Cálculo de frete', async () => {
          const { cotarFreteDetalhado } = await import('../frete');
          const { cotacoes } = await cotarFreteDetalhado('20040020', [{ quantity: 1, price: 99 }]);
          if (cotacoes.length === 0) throw new Error('o Melhor Envio não devolveu nenhuma opção de frete para um CEP do Rio');
          return `${cotacoes.length} opções`;
        })
      : Promise.resolve({ nome: 'Cálculo de frete', ok: false, ms: 0, detalhe: 'Melhor Envio não configurado' }),
    integracoes.kv()
      ? medir('Banco rápido (Upstash)', async () => {
          await kvSet('saude:ping', Date.now(), 600);
          return 'ok';
        })
      : Promise.resolve({ nome: 'Banco rápido (Upstash)', ok: false, ms: 0, detalhe: 'não configurado' }),
  ]);
  await kvSet(CHAVE_ULTIMO, { em: Date.now(), checks }, 2 * 86_400).catch(() => undefined);
  return checks;
}

export async function ultimaSaude(): Promise<{ em: number; checks: Checagem[] } | null> {
  return kvGet<{ em: number; checks: Checagem[] }>(CHAVE_ULTIMO).catch(() => null);
}

/** Rotina do cron: testa e alerta na 2ª falha seguida e quando volta. */
export async function rotinaSaude(alertar: boolean): Promise<{ falhando: string[] }> {
  const checks = await verificarSaude();
  const estado = (await kvGet<Estado>(CHAVE_ESTADO).catch(() => null)) || {};
  const agora = Date.now();
  for (const c of checks) {
    // "não configurado" não é queda: não alerta
    if (/não configurado/.test(c.detalhe)) continue;
    const e = estado[c.nome] || { falhas: 0 };
    if (!c.ok) {
      e.falhas += 1;
      e.desde = e.desde || agora;
      if (e.falhas >= 2 && !e.alertado) {
        if (alertar) await alertarCelular(`🔴 ${c.nome} com problema há ~${Math.round((agora - e.desde) / 60_000)} min\n${c.detalhe}\nClientes podem não conseguir comprar.`);
        e.alertado = true;
      }
    } else {
      if (e.alertado && alertar) await alertarCelular(`🟢 ${c.nome} voltou a funcionar (ficou fora ~${Math.round((agora - (e.desde || agora)) / 60_000)} min).`);
      e.falhas = 0;
      e.desde = undefined;
      e.alertado = false;
    }
    estado[c.nome] = e;
  }
  await kvSet(CHAVE_ESTADO, estado, 7 * 86_400).catch(() => undefined);
  return { falhando: checks.filter((c) => !c.ok && !/não configurado/.test(c.detalhe)).map((c) => c.nome) };
}
