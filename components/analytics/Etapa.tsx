'use client';

// Funil anônimo e origem da visita (de qual anúncio/campanha a pessoa veio).
// Nada pessoal: só a etapa e a origem (utm_source/campaign/content), guardadas no próprio navegador.

export type Origem = { source: string; medium?: string; campaign?: string; content?: string; em: number };

const CHAVE_ORIGEM = 'sv_origem';
const VALIDADE_MS = 7 * 86_400_000; // mesma janela de 7 dias da Meta
const limpo = (v: string | null) => (v || '').replace(/[^\w\-.:/ |{}À-ÿ—–]/g, '').slice(0, 80) || undefined;

/** Guarda a origem quando a pessoa chega por um link com UTM (ou com fbclid, clique da Meta). */
export function registrarOrigem() {
  try {
    const p = new URLSearchParams(window.location.search);
    const source = limpo(p.get('utm_source')) || (p.get('fbclid') ? 'meta' : undefined);
    if (!source) return;
    const o: Origem = {
      source: source.toLowerCase(),
      medium: limpo(p.get('utm_medium')),
      campaign: limpo(p.get('utm_campaign')),
      content: limpo(p.get('utm_content')),
      em: Date.now(),
    };
    localStorage.setItem(CHAVE_ORIGEM, JSON.stringify(o));
  } catch {
    // sem localStorage
  }
}

/** Origem dos últimos 7 dias, se houver. */
export function origemAtual(): Origem | null {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE_ORIGEM) || 'null') as Origem | null;
    return o && Date.now() - o.em < VALIDADE_MS ? o : null;
  } catch {
    return null;
  }
}

/** Conta uma etapa do funil uma vez por dia neste navegador (com a origem, se veio de anúncio). */
export function marcarEtapa(etapa: 'visita' | 'produto' | 'sacola' | 'checkout') {
  try {
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const k = `sv_funil_${etapa}`;
    if (localStorage.getItem(k) === dia) return;
    localStorage.setItem(k, dia);
    const corpo = JSON.stringify({ etapa, origem: origemAtual()?.source });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/evento', new Blob([corpo], { type: 'application/json' }));
    else fetch('/api/evento', { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
  } catch {
    // modo privado sem localStorage: ignora
  }
}
