'use client';

// Botão de formulário que mostra "enviando…" e trava enquanto a ação roda.
import { useFormStatus } from 'react-dom';

export function BotaoEnviando({ texto, enviando, className }: { texto: string; enviando: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={className}>
      {pending ? enviando : texto}
    </button>
  );
}
