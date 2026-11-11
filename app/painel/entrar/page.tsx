import { redirect } from 'next/navigation';
import { logado, senhaPainel } from '../../../lib/painel/auth';
import { entrar } from '../actions';

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await logado()) redirect('/painel');
  const { erro } = await searchParams;
  return (
    <div className="min-h-full flex items-center justify-center px-4 py-16">
      <form action={entrar} className="w-full max-w-sm bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-3">
        <h1 className="text-lg font-semibold">
          Samba Vest <span className="text-[#C9A227]">Painel</span>
        </h1>
        {!senhaPainel() && (
          <p className="text-sm text-red-700">Defina PAINEL_SENHA (ou ATENDIMENTO_SENHA) na Vercel para liberar o painel.</p>
        )}
        {erro === 'senha' && <p className="text-sm text-red-700">Senha incorreta.</p>}
        {erro === 'bloqueado' && <p className="text-sm text-red-700">Muitas tentativas. Aguarde 15 minutos.</p>}
        <input name="senha" type="password" placeholder="Senha" required autoFocus className="border border-slate-300 rounded-lg p-3" />
        <button className="bg-[#0B1B34] text-white rounded-lg p-3 font-medium">Entrar</button>
      </form>
    </div>
  );
}
