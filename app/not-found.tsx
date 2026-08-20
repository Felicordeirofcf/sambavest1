import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-white px-4">
      <div className="text-center">
        <h1 className="font-heading text-8xl md:text-9xl font-extrabold text-[#F0DFA8]">404</h1>

        <div className="relative -mt-10 md:-mt-16">
          <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-4">
            Página não encontrada
          </h2>
          <div className="w-12 h-0.5 bg-[#C9A227] mx-auto mb-8"></div>

          <p className="max-w-md mx-auto text-gray-500 text-sm md:text-base leading-relaxed mb-10">
            Ops! Parece que essa camisa saiu de linha ou o link foi digitado incorretamente.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <Link
              href="/"
              className="w-full md:w-auto px-8 py-4 bg-[#0B1B34] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors"
            >
              Voltar para a Home
            </Link>

            <Link
              href="/categoria/lancamentos"
              className="w-full md:w-auto px-8 py-4 border border-gray-200 text-[#0B1B34] text-xs font-bold uppercase tracking-widest hover:border-[#C9A227] transition-colors"
            >
              Ver Lançamentos
            </Link>
          </div>
        </div>

        <p className="mt-16 text-xs text-gray-400 uppercase tracking-tighter">
          Precisa de ajuda? <Link href="/contato" className="underline hover:text-[#0B1B34]">Fale com nosso suporte</Link>
        </p>
      </div>
    </div>
  );
}
