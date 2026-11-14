'use client';

// Partes interativas da tela de atendimento: atualização automática, rolagem do chat e caixa de resposta.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** Recarrega os dados a cada `segundos`, menos enquanto você está digitando uma resposta. */
export function AutoAtualizar({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      const caixa = document.querySelector<HTMLTextAreaElement>('textarea[name="texto"]');
      if (caixa && (caixa.value.trim() || document.activeElement === caixa)) return;
      router.refresh();
    }, segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}

/** Área do chat que já abre rolada até a última mensagem (e acompanha as novas). */
export function RolarParaFim({ children, chave, className = '' }: { children: ReactNode; chave: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chave]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

function BotaoEnviar() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      aria-label="Enviar"
      title="Enviar (Enter)"
      className="wa-enviar grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-[1px]" fill="currentColor" aria-hidden>
          <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8Z" />
        </svg>
      )}
    </button>
  );
}

/** Caixa de resposta com respostas rápidas. Enter envia; Shift+Enter quebra a linha. */
export function CaixaResposta({
  numero,
  acao,
  rapidas,
}: {
  numero: string;
  acao: (f: FormData) => Promise<void>;
  rapidas: { rotulo: string; texto: string }[];
}) {
  const [texto, setTexto] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={async (f) => { await acao(f); setTexto(''); }} className="wa-barra px-3 pb-3 pt-2">
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        {rapidas.map((r) => (
          <button
            key={r.rotulo}
            type="button"
            onClick={() => {
              setTexto((t) => (t ? `${t}\n${r.texto}` : r.texto));
              ref.current?.focus();
            }}
            className="wa-campo shrink-0 rounded-full px-3 py-1 text-xs shadow-sm hover:brightness-95"
          >
            {r.rotulo}
          </button>
        ))}
      </div>
      <input type="hidden" name="numero" value={numero} />
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          name="texto"
          required
          rows={Math.min(5, Math.max(1, texto.split('\n').length))}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (texto.trim()) form.current?.requestSubmit();
            }
          }}
          placeholder="Digite uma mensagem"
          title="Enter envia · Shift+Enter pula linha"
          className="wa-campo min-h-10 flex-1 resize-none rounded-lg border-0 px-3 py-2.5 text-[15px] leading-5 focus:outline-none"
        />
        <BotaoEnviar />
      </div>
    </form>
  );
}
