'use client';

// Medição anônima da página da Black: tempo na página, rolagem e em que a pessoa toca.
// Cada sinal conta no máximo 1 vez por dia por navegador. Nada pessoal é enviado.
import { useEffect } from 'react';
import { origemAtual } from '../analytics/Etapa';

function enviar(sinal: string) {
  try {
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const k = `sv_bf_${sinal}`;
    if (localStorage.getItem(k) === dia) return;
    localStorage.setItem(k, dia);
    const corpo = JSON.stringify({ bf: sinal, origem: origemAtual()?.source });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/evento', new Blob([corpo], { type: 'application/json' }));
    else fetch('/api/evento', { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
  } catch {
    // modo privado sem localStorage: ignora
  }
}

export default function MedirBF() {
  useEffect(() => {
    const inicio = Date.now();
    let interagiu = false;
    let saidaContada = false;
    enviar('abriu');

    const timers = [
      window.setTimeout(() => enviar('ficou15s'), 15_000),
      window.setTimeout(() => enviar('ficou60s'), 60_000),
    ];

    const aoRolar = () => {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      if (alto <= 0) return;
      const p = window.scrollY / alto;
      if (p > 0.1) interagiu = true;
      if (p >= 0.5) enviar('rolou50');
      if (p >= 0.9) enviar('rolou90');
    };

    const aoTocar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement | null)?.closest<HTMLElement>('a,button');
      if (!alvo) return;
      interagiu = true;
      const marcado = alvo.closest<HTMLElement>('[data-bf]')?.dataset.bf;
      const href = alvo.getAttribute('href') || '';
      enviar(marcado ? `toque-${marcado}` : /wa\.me|whatsapp/.test(href) ? 'toque-zap' : 'toque-outro');
    };

    // Saiu cedo: a página ficou escondida em até 5 s sem rolar nem tocar
    const aoSair = (e: Event) => {
      if ((e.type === 'visibilitychange' && document.visibilityState !== 'hidden') || saidaContada) return;
      saidaContada = true;
      if (!interagiu && Date.now() - inicio <= 5_000) enviar('saiu5s');
    };

    window.addEventListener('scroll', aoRolar, { passive: true });
    document.addEventListener('click', aoTocar, true);
    document.addEventListener('visibilitychange', aoSair);
    window.addEventListener('pagehide', aoSair);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('scroll', aoRolar);
      document.removeEventListener('click', aoTocar, true);
      document.removeEventListener('visibilitychange', aoSair);
      window.removeEventListener('pagehide', aoSair);
    };
  }, []);
  return null;
}
