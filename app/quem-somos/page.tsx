import Link from 'next/link';
import Image from 'next/image';

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
        <div className="relative z-20 text-center px-4">
          <h1 className="font-heading text-4xl md:text-5xl font-extrabold uppercase tracking-widest text-white mb-4 drop-shadow-md">
            Quem Somos
          </h1>
          <div className="w-16 h-0.5 bg-[#C9A227] mx-auto"></div>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <nav className="text-xs text-gray-500 uppercase tracking-wide">
          <Link href="/" className="hover:text-[#0B1B34] transition-colors">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-[#1E2233] font-semibold">Quem Somos</span>
        </nav>
      </div>

      {/* Seção Principal: A História */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 text-center">
        <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-8">
          A Essência Samba Vest
        </h2>
        <div className="space-y-6 text-gray-600 leading-relaxed md:text-lg font-light">
          <p>
            A Samba Vest nasceu da paixão pelo carnaval e pela cultura das escolas de samba.
            Produzimos camisas oficiais de enredo, sempre inspiradas nas histórias e nos
            desfiles que emocionam o Brasil inteiro a cada ano.
          </p>
          <p>
            Cada estampa é desenvolvida com cuidado, dos detalhes dos figurinos às cores
            que representam cada agremiação. Nossa curadoria busca o equilíbrio entre fidelidade
            ao enredo e conforto no dia a dia — para vestir com orgulho nos ensaios, nos blocos
            e no grande desfile.
          </p>
          <p>
            Mais do que uma marca de camisas, somos torcedores da avenida. Nosso compromisso é
            entregar qualidade de estampa, tecido confortável e um atendimento próximo, de
            samba para samba.
          </p>
        </div>
      </section>

      {/* Seção com Imagem Dupla (Produtos) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 border-t border-gray-100">
        <div className="flex flex-col md:flex-row gap-8 items-center">
          <div className="w-full md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left order-2 md:order-1 pt-8 md:pt-0 md:pr-12">
            <h3 className="font-heading text-xl md:text-2xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-6">
              Nosso Propósito
            </h3>
            <p className="text-gray-600 leading-relaxed font-light mb-6">
              Nossa missão é aproximar o torcedor da avenida o ano inteiro. Queremos que, ao
              vestir uma camisa Samba Vest, você carregue a emoção do desfile — seja
              relembrando um enredo campeão ou já torcendo pela próxima conquista.
            </p>
            <p className="text-gray-600 leading-relaxed font-light">
              Na Samba Vest, a exclusividade mora nos detalhes: tecido leve, secagem rápida
              e estampas de alta qualidade, do tamanho P ao EXG.
            </p>
          </div>

          <div className="w-full md:w-1/2 flex gap-4 h-[400px] md:h-[500px] order-1 md:order-2">
            <div className="w-1/2 h-full mt-8 relative bg-[#FAF7EF]">
              <Image
                src="/products/beija-flor-2027-zeneida.webp"
                alt="Camisa Beija-Flor 2027 — Zeneida"
                fill
                sizes="(max-width: 768px) 45vw, 300px"
                className="object-contain p-3"
              />
            </div>
            <div className="w-1/2 h-full mb-8 relative bg-[#FAF7EF]">
              <Image
                src="/products/viradouro-2024-malunguinho.webp"
                alt="Camisa Viradouro 2024 — Malunguinho"
                fill
                sizes="(max-width: 768px) 45vw, 300px"
                className="object-contain p-3"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
