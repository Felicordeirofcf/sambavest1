'use client';

/** Conta uma etapa do funil uma vez por dia neste navegador. */
export function marcarEtapa(etapa: 'visita' | 'produto' | 'sacola' | 'checkout') {
  try {
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const k = `sv_funil_${etapa}`;
    if (localStorage.getItem(k) === dia) return;
    localStorage.setItem(k, dia);
    const corpo = JSON.stringify({ etapa });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/evento', new Blob([corpo], { type: 'application/json' }));
    else fetch('/api/evento', { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
  } catch {
    // modo privado sem localStorage: ignora
  }
}
