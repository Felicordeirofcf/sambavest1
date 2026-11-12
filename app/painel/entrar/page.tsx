import { redirect } from 'next/navigation';
import { logado, senhaPainel } from '../../../lib/painel/auth';
import { entrar } from '../actions';

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await logado()) redirect('/painel');
  const { erro } = await searchParams;
  return (
    <div className="min-h-[calc(100vh-6px)] flex items-center justify-center px-4 py-16">
      <form action={entrar} className="w-full max-w-sm bg-white rounded-2xl p-7 flex flex-col gap-4 shadow-2xl shadow-black/30">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--sv-ouro-escuro)]">painel da loja</p>
          <h1 className="text-3xl font-extrabold mt-1">Samba Vest</h1>
          <p className="text-sm text-slate-500 mt-1">Vendas, pedidos, clientes e WhatsApp num lugar só.</p>
        </div>
        {!senhaPainel() && (
          <p className="text-sm text-red-700">Defina PAINEL_SENHA (ou ATENDIMENTO_SENHA) na Vercel para liberar o painel.</p>
        )}
        {erro === 'senha' && <p className="text-sm text-red-700">Senha incorreta. Tente de novo.</p>}
        {erro === 'bloqueado' && <p className="text-sm text-red-700">Muitas tentativas. Aguarde 15 minutos.</p>}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Senha
          <input name="senha" type="password" required autoFocus className="border border-slate-300 rounded-lg px-3 py-2.5" />
        </label>
        <button className="bg-[#0B1B34] text-white rounded-lg py-3 font-semibold">Entrar no painel</button>
      </form>
    </div>
  );
}
