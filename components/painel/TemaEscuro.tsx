'use client';

// Botão do modo escuro do painel: troca a classe no .sv e guarda a escolha num cookie
// (o layout lê o cookie no servidor, então a tela já abre no tema certo, sem piscar).
import { useState } from 'react';

export default function TemaEscuro({ inicial }: { inicial: boolean }) {
  const [escuro, setEscuro] = useState(inicial);
  const trocar = () => {
    const novo = !escuro;
    setEscuro(novo);
    document.querySelector('.sv')?.classList.toggle('sv-escuro', novo);
    document.cookie = `sv_tema=${novo ? 'escuro' : 'claro'}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" onClick={trocar} className="sv-trilho-link" aria-pressed={escuro} title={escuro ? 'Modo claro' : 'Modo escuro'}>
      {escuro ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
      <span>{escuro ? 'Claro' : 'Escuro'}</span>
    </button>
  );
}
