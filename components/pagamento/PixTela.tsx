'use client';

// Tela de Pix: gera o Pix (uma vez), mostra o QR Code e o "copia e cola", e avisa quando o pagamento cai.
// Se algo falhar, abre a página de pagamento do WordPress (plano B) em vez de deixar o cliente parado.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Dados = { ok: boolean; numero?: number; total?: number; pago?: boolean; codigo?: string; imagem?: string; fallback?: string; motivo?: string };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PixTela({ pedido, chave, whatsapp }: { pedido: number; chave: string; whatsapp: string }) {
  const [d, setD] = useState<Dados | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [demora, setDemora] = useState(false);
  const iniciou = useRef(false);

  const ir = useCallback((url?: string) => {
    if (url) window.location.assign(url);
  }, []);

  // 1) Gera o Pix. Qualquer falha: cai na página de pagamento do WordPress.
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    const aviso = window.setTimeout(() => setDemora(true), 8000);
    fetch('/api/pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido, chave }) })
      .then((r) => r.json())
      .then((j: Dados) => {
        window.clearTimeout(aviso);
        if (j.ok && (j.pago || j.codigo)) setD(j);
        else if (j.fallback) ir(j.fallback);
        else setD({ ok: false, motivo: j.motivo || 'não foi possível abrir o pagamento' });
      })
      .catch(() => setD({ ok: false, motivo: 'sem conexão' }));
    return () => window.clearTimeout(aviso);
  }, [pedido, chave, ir]);

  // 2) Enquanto espera o pagamento, confere a situação a cada 4 s (para quando o Pix cai)
  useEffect(() => {
    if (!d?.ok || d.pago) return;
    const t = window.setInterval(() => {
      fetch(`/api/pix?pedido=${pedido}&k=${encodeURIComponent(chave)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j: Dados) => j.ok && j.pago && setD((a) => (a ? { ...a, pago: true } : a)))
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(t);
  }, [d?.ok, d?.pago, pedido, chave]);

  const copiar = async () => {
    if (!d?.codigo) return;
    try {
      await navigator.clipboard.writeText(d.codigo);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = d.codigo;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2500);
  };

  const cartao = 'mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_4px_18px_rgba(11,27,52,0.08)]';

  if (!d) {
    return (
      <main className="min-h-[70vh] bg-[#f6f4ef] px-3 py-6">
        <div className={`${cartao} text-center`} role="status" aria-live="polite">
          <h1 className="text-xl font-black text-[#0B1B34]">Gerando seu Pix…</h1>
          <p className="mt-1 text-sm text-slate-500">{demora ? 'Está demorando um pouco mais. Não feche esta tela.' : 'Leva só alguns segundos'}</p>
          <div className="mx-auto my-8 h-12 w-12 animate-spin rounded-full border-[5px] border-slate-200 border-t-[#C9A227]" />
        </div>
      </main>
    );
  }

  if (!d.ok) {
    return (
      <main className="min-h-[70vh] bg-[#f6f4ef] px-3 py-6">
        <div className={`${cartao} text-center`}>
          <h1 className="text-xl font-black text-[#0B1B34]">Não conseguimos abrir o pagamento</h1>
          <p className="mt-2 text-sm text-slate-600">Confira o link ou fale com a gente: seu pedido está guardado.</p>
          <a href={`https://wa.me/${whatsapp}`} className="mt-5 block rounded-xl bg-[#25D366] py-3 text-sm font-black text-black">
            Falar com a Samba Vest
          </a>
        </div>
      </main>
    );
  }

  if (d.pago) {
    return (
      <main className="min-h-[70vh] bg-[#f6f4ef] px-3 py-6">
        <div className={`${cartao} text-center`}>
          <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-full bg-emerald-600 shadow-[0_0_0_10px_rgba(22,163,74,0.15)]">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-[#0B1B34]">Pagamento confirmado!</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pedido #{d.numero}
            {d.total ? ` · ${brl(d.total)} no Pix` : ''}
          </p>
          <ul className="mt-5 space-y-3 text-left text-sm text-slate-700">
            <li><b>1.</b> A nota fiscal vai para o seu e-mail.</li>
            <li><b>2.</b> Preparamos a sua camisa e <b>avisamos no WhatsApp</b> com o código de rastreio.</li>
          </ul>
          <a href={`https://wa.me/${whatsapp}`} className="mt-5 block rounded-xl bg-[#25D366] py-3 text-sm font-black text-black">
            💬 Falar com a Samba Vest
          </a>
          <Link href="/" className="mt-2 block rounded-xl bg-[#0B1B34] py-3 text-sm font-black uppercase tracking-wider text-white">
            Continuar comprando
          </Link>
          <p className="mt-4 text-xs text-slate-400">Obrigado por desfilar com a gente! 🥁</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[70vh] bg-[#f6f4ef] px-3 py-6">
      <div className={cartao}>
        <h1 className="text-center text-xl font-black text-[#0B1B34]">Pague com Pix</h1>
        {!!d.total && <p className="mt-1 text-center text-4xl font-black tracking-tight text-[#0B1B34]">{brl(d.total)}</p>}
        <p className="text-center text-xs text-slate-500">Pedido #{d.numero} · Samba Vest</p>

        {d.imagem && (
          <div className="mx-auto my-4 w-56 rounded-2xl border-2 border-[#0B1B34] bg-white p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.imagem} alt="QR Code do Pix" className="h-auto w-full" />
          </div>
        )}

        <button
          type="button"
          onClick={copiar}
          className="mt-3 w-full rounded-xl bg-[#C9A227] py-3.5 text-sm font-black uppercase tracking-wider text-[#0B1B34] transition active:scale-[0.99]"
        >
          {copiado ? '✓ Código copiado!' : 'Copiar código Pix'}
        </button>
        <p className="mt-2 max-h-12 overflow-hidden break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-[11px] leading-snug text-slate-500">{d.codigo}</p>

        <p className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600" role="status" aria-live="polite">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-600" /> Aguardando o pagamento…
        </p>
      </div>

      <div className="mx-auto mt-3 w-full max-w-md rounded-2xl bg-white p-4 text-sm text-slate-600">
        <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[#0B1B34]">Como pagar</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra o app do seu banco e escolha <b>Pix</b></li>
          <li>Escaneie o QR Code ou use o <b>Pix copia e cola</b></li>
          <li>Confirme. A aprovação é <b>na hora</b></li>
        </ol>
      </div>
      <p className="mt-3 text-center text-xs font-semibold text-slate-500">🔒 Pagamento seguro · ⚡ Aprovação na hora</p>
    </main>
  );
}
