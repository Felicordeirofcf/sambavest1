import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="w-full min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative w-full h-[40vh] md:h-[50vh] bg-[#0B1B34] flex items-center justify-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-[360px] w-[360px] rounded-full bg-[#C9A227]/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 bottom-0 h-[280px] w-[280px] rounded-full bg-[#C9A227]/10 blur-3xl"
        />
        <div className="relative z-20 text-center px-4 max-w-4xl mx-auto">
          <span className="text-[#C9A227] text-xs md:text-sm font-bold uppercase tracking-[0.3em] block mb-3">
            Sobre a SambaVest
          </span>
          <h1 className="font-heading text-3xl md:text-5xl font-extrabold uppercase tracking-widest text-white mb-4 drop-shadow-md">
            Vista sua paixão pelo samba com originalidade e orgulho
          </h1>
          <div className="w-16 h-0.5 bg-[#C9A227] mx-auto mt-4"></div>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <nav className="text-xs text-gray-500 uppercase tracking-wide">
          <Link href="/" className="hover:text-[#0B1B34] transition-colors">Início</Link>
          <span className="mx-2">/</span>
          <span className="text-[#1E2233] font-semibold">Sobre nós</span>
        </nav>
      </div>

      {/* Seção Principal: A História */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 text-center">
        <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-8">
          A Essência SambaVest
        </h2>
        <div className="space-y-6 text-gray-600 leading-relaxed md:text-lg font-light">
          <p>
            A SambaVest nasceu da paixão pelo Carnaval carioca e da vontade de aproximar os amantes do samba às suas escolas de samba do coração.
          </p>
          <p>
            Somos especializados na venda de camisas oficiais e licenciadas das mais renomadas escolas de samba do Rio de Janeiro, como Mangueira, Beija-Flor, Portela, Salgueiro, entre outras. Cada peça reflete a autenticidade, qualidade e a história de cada agremiação.
          </p>
          <p>
            Nosso compromisso é celebrar a cultura do samba através de produtos exclusivos que representam a energia contagiante e a tradição do nosso Carnaval. Trabalhamos lado a lado com as escolas para garantir que cada camisa conte um pouco da história de seus enredos, cores e raízes.
          </p>
        </div>
      </section>

      {/* Seção de Destaques (O que você encontra) */}
      <section className="bg-[#FAF7EF] py-16 px-4 sm:px-6 lg:px-8 my-8 border-y border-gray-100">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="font-heading text-xl md:text-2xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-8">
            Para quem ama o samba de verdade
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left mb-10">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start gap-4">
              <span className="text-[#C9A227] text-xl font-bold">✓</span>
              <p className="text-gray-700 font-medium text-sm md:text-base">Camisas licenciadas diretamente com as escolas</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start gap-4">
              <span className="text-[#C9A227] text-xl font-bold">✓</span>
              <p className="text-gray-700 font-medium text-sm md:text-base">Designs únicos inspirados nos enredos de cada ano</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start gap-4">
              <span className="text-[#C9A227] text-xl font-bold">✓</span>
              <p className="text-gray-700 font-medium text-sm md:text-base">Entrega para todo o Brasil com total segurança</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start gap-4">
              <span className="text-[#C9A227] text-xl font-bold">✓</span>
              <p className="text-gray-700 font-medium text-sm md:text-base">Atendimento humanizado e política de troca clara</p>
            </div>
          </div>
          <p className="text-gray-600 font-light text-sm md:text-base max-w-2xl mx-auto">
            Queremos que você vista sua paixão com orgulho, sabendo que está adquirindo um produto original que apoia diretamente o samba e o Carnaval brasileiro.
          </p>
        </div>
      </section>

      {/* Seção Final: Fechamento e Instagram */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 text-center">
        <h3 className="font-heading text-xl md:text-2xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-6">
          Vista o samba. Viva a cultura.
        </h3>
        <p className="text-gray-600 leading-relaxed font-light mb-8 max-w-xl mx-auto">
          Acompanhe nosso dia a dia e novidades no Instagram da SambaVest e fique por dentro das novas coleções e parcerias com as escolas de samba.
        </p>

        {/* Botão do Instagram */}
        <a
          href="https://www.instagram.com/sambavest/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-3 px-8 py-4 mb-12 bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] text-white rounded-full font-bold uppercase tracking-widest text-sm transition-transform duration-300 hover:scale-105 shadow-lg shadow-pink-500/30"
        >
          {/* Ícone do Instagram em SVG puro */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>
          </svg>
          Siga @sambavest
        </a>

        {/* Bloco do Lema */}
        <div className="p-6 md:p-10 bg-[#0B1B34] rounded-2xl text-white shadow-xl">
          <span className="block text-xs md:text-sm uppercase tracking-[0.3em] text-[#C9A227] font-bold mb-3">
            Nosso lema
          </span>
          <span className="font-heading text-lg md:text-2xl uppercase tracking-wider font-extrabold">
            SambaVest: onde o amor pelo samba vira camisa.
          </span>
        </div>
      </section>
    </div>
  );
}