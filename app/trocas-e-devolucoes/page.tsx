import Link from 'next/link';

export default function UnderConstructionPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center bg-white px-4 text-center">
      <h1 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-4">
        Em Breve
      </h1>
      <div className="w-12 h-0.5 bg-[#C9A227] mx-auto mb-6"></div>

      <p className="text-gray-500 text-sm md:text-base max-w-md mx-auto mb-10 leading-relaxed">
        Estamos preparando este espaço com muito carinho para melhorar ainda mais a sua experiência na Samba Vest.
      </p>

      <Link
        href="/"
        className="px-8 py-4 bg-[#0B1B34] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors"
      >
        Voltar para a Loja
      </Link>
    </div>
  );
}
