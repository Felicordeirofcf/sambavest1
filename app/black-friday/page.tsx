import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Contagem from '../../components/blackfriday/Contagem';
import Duelo from '../../components/blackfriday/Duelo';
import { BF, brl, faseBF, placarDuelo, produtosBF, ProdutoBF } from '../../lib/blackfriday';
import { FRETE_GRATIS_A_PARTIR_DE } from '../../lib/frete';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Black Friday Samba Vest: o Duelo Beija-Flor × Viradouro 2027',
  description:
    'Camisas enredo 2027 da Beija-Flor (Zeneida) e da Viradouro (Griô) por R$ 99 na Black Friday Samba Vest. Escolha o seu lado!',
  alternates: { canonical: '/black-friday' },
  openGraph: {
    title: 'Black do Duelo: Beija-Flor × Viradouro 2027 por R$ 99',
    description: 'Camisas enredo 2027 com preço de Black Friday. Nilópolis ou Niterói? Escolha o seu lado.',
    images: ['/products/viradouro27.webp', '/products/beija-flor-2027-zeneida.webp'],
  },
};

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

function Cartao({ p, fase, destaque }: { p: ProdutoBF; fase: ReturnType<typeof faseBF>; destaque?: boolean }) {
  // Durante a campanha mostramos o preço que o WooCommerce realmente cobra.
  const preco = fase === 'durante' && p.precoAtual ? p.precoAtual : p.precoBlack;
  const de = p.precoCheio && p.precoCheio > preco ? p.precoCheio : undefined;
  const economia = de ? Math.round((1 - preco / de) * 100) : 0;
  const azul = p.escola === 'beija-flor';
  // Sem o produto do WooCommerce não há para onde mandar (as categorias redirecionam para cá):
  // o cliente compra pelo WhatsApp.
  const base = p.slug ? `/produto/${p.slug}` : p.produtoId ? `/produto/${p.produtoId}` : null;
  const href = base && p.modelo ? `${base}?modelo=${encodeURIComponent(p.modelo)}` : base;
  const tamanhos = p.tamanhos?.length ? (p.tamanhos.length === 1 ? `tamanho ${p.tamanhos[0]}` : `tamanhos ${p.tamanhos.join(', ')}`) : 'do P ao EXG';
  const zap = `https://wa.me/${BF.whatsapp}?text=${encodeURIComponent(`Quero a ${p.titulo} da Black Friday!`)}`;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-[#0d0d12] ${
        azul ? 'border-sky-500/40 shadow-[0_0_40px_-10px_rgba(14,165,233,0.5)]' : 'border-red-500/40 shadow-[0_0_40px_-10px_rgba(239,68,68,0.5)]'
      } ${destaque ? '' : 'md:flex-row'}`}
    >
      <div className={`relative ${destaque ? 'aspect-square' : 'aspect-square md:w-1/2'} ${azul ? 'bg-sky-950/40' : 'bg-red-950/40'}`}>
        <Image
          src={p.imagem}
          alt={p.titulo}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
        />
        {economia > 0 && (
          <span className="absolute left-4 top-4 rotate-[-6deg] rounded-xl bg-[#C9A227] px-3 py-1.5 text-lg font-black leading-none text-black shadow-lg">
            -{economia}% <span className="text-xs">OFF</span>
          </span>
        )}
        <span
          className={`absolute right-4 top-4 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white ${azul ? 'bg-sky-600' : 'bg-red-600'}`}
        >
          {azul ? 'Beija-Flor' : 'Viradouro'}
        </span>
      </div>

      <div className={`flex flex-1 flex-col gap-3 p-5 sm:p-6 ${destaque ? '' : 'md:justify-center'}`}>
        <p className={`text-xs font-bold uppercase tracking-[0.2em] ${azul ? 'text-sky-300' : 'text-red-300'}`}>Enredo: {p.enredo}</p>
        <h3 className="text-xl sm:text-2xl font-black uppercase leading-tight text-white">{p.titulo}</h3>
        <p className="text-sm text-white/60">{p.descricao}</p>

        <div className="mt-1">
          {de && (
            <p className="text-lg font-bold text-white/60">
              De <span className="line-through decoration-red-500 decoration-2">{brl(de)}</span>
            </p>
          )}
          <p className="text-4xl font-black text-white">
            <span className="text-base font-bold text-white/60">por </span>
            {brl(preco)}
          </p>
          {de && (
            <p className="mt-2 inline-block rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-black text-emerald-300">
              Economize {brl(de - preco)}
            </p>
          )}
          <p className="mt-1 text-xs text-white/40">+ frete · {p.modelos?.length ? `${p.modelos.join(' e ')}, ` : ''}{tamanhos}</p>
        </div>

        {fase === 'durante' && !href ? (
          <a
            href={zap}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-center text-sm font-black uppercase tracking-widest text-black"
          >
            Comprar pelo WhatsApp
          </a>
        ) : fase === 'durante' && href ? (
          <Link
            href={href}
            className={`mt-2 rounded-xl px-5 py-3.5 text-center text-sm font-black uppercase tracking-widest text-white transition ${
              azul ? 'bg-sky-600 hover:bg-sky-500' : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            Garantir a minha
          </Link>
        ) : fase === 'antes' && href ? (
          <Link
            href={href}
            className="mt-2 rounded-xl border border-white/20 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-white/80 hover:bg-white/5"
          >
            Ver a camisa · preço Black a partir de {DATA.format(BF.inicio)}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default async function BlackFridayPage() {
  const fase = faseBF();
  const [produtos, placar] = await Promise.all([produtosBF(), placarDuelo()]);
  const beija = produtos.find((p) => p.id === 'beija-flor-enredo')!;
  const viradouro = produtos.find((p) => p.id === 'viradouro-enredo')!;
  const algodao = produtos.find((p) => p.id === 'viradouro-algodao')!;
  const precoVisto = (p: ProdutoBF) => (fase === 'durante' && p.precoAtual ? p.precoAtual : p.precoBlack);
  const menorEnredo = Math.min(precoVisto(beija), precoVisto(viradouro));
  const vip = `https://wa.me/${BF.whatsapp}?text=${encodeURIComponent('Quero entrar na lista VIP da Black Friday Samba Vest!')}`;

  return (
    <main className="bg-black text-white">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 grid grid-cols-2">
          <div className="bg-gradient-to-br from-sky-700/50 via-blue-950/40 to-black" />
          <div className="bg-gradient-to-bl from-red-700/50 via-red-950/40 to-black" />
        </div>
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#0ea5e9_0_25%,#fff_25%_50%,#dc2626_50%_75%,#C9A227_75%)]" />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-14 text-center sm:py-20">
          <p className="rounded-full border border-[#C9A227]/50 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.35em] text-[#C9A227]">
            Black Friday Samba Vest · {DATA.format(BF.inicio)} a {DATA.format(BF.fim)}
          </p>
          <h1 className="text-5xl font-black uppercase leading-[0.9] sm:text-7xl">
            Black do <span className="bg-gradient-to-r from-sky-400 via-white to-red-500 bg-clip-text text-transparent">Duelo</span>
          </h1>
          <p className="max-w-xl text-lg text-white/80">
            <b className="text-sky-300">Beija-Flor</b> × <b className="text-red-400">Viradouro</b>. As camisas enredo 2027 a partir de{' '}
            <b className="text-white">{Number.isInteger(menorEnredo) ? `R$ ${menorEnredo}` : brl(menorEnredo)}</b>. Nilópolis ou Niterói: escolha o seu lado.
          </p>
          {fase === 'antes' && <Contagem alvo={BF.inicio.toISOString()} rotulo="A avenida abre em" />}
          {fase === 'durante' && <Contagem alvo={BF.fim.toISOString()} rotulo="A Black termina em" />}
          {fase === 'depois' && (
            <p className="rounded-xl bg-white/10 px-5 py-3 text-sm">A Black Friday terminou. Obrigado por desfilar com a gente! 🥁</p>
          )}
          {fase !== 'depois' && (
            <a
              href={vip}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#25D366] px-6 py-3 text-sm font-black uppercase tracking-widest text-black transition hover:scale-105"
            >
              {fase === 'antes' ? 'Entrar na lista VIP pelo WhatsApp' : 'Dúvidas? Fale no WhatsApp'}
            </a>
          )}
        </div>
      </section>

      {/* O DUELO */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black uppercase sm:text-4xl">Qual é a sua escola de samba favorita?</h2>
          <p className="mt-2 text-white/60">Vote no duelo e veja quem está ganhando no placar ao vivo.</p>
        </div>
        <Duelo inicial={placar} />

        <div className="relative mt-12 grid gap-6 md:grid-cols-2">
          <Cartao p={beija} fase={fase} destaque />
          <span
            aria-hidden
            className="absolute left-1/2 top-1/3 z-10 hidden h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-4 border-black bg-[#C9A227] text-xl font-black text-black md:flex"
          >
            VS
          </span>
          <Cartao p={viradouro} fase={fase} destaque />
        </div>
      </section>

      {/* ALGODÃO */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-6 text-center text-2xl font-black uppercase sm:text-3xl">
          Para usar o ano inteiro <span className="text-red-500">❤️🤍</span>
        </h2>
        <Cartao p={algodao} fase={fase} />
      </section>

      {/* COMO FUNCIONA */}
      <section className="border-t border-white/10 bg-white/[0.03]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3">
          {[
            ['💳', 'Pix ou cartão', 'Pague no Pix (aprovação na hora) ou no cartão de crédito. Preço da Black já com desconto.'],
            ['🚚', 'Frete para todo o Brasil', `Calculado no carrinho. Acima de ${brl(FRETE_GRATIS_A_PARTIR_DE)} em camisas, o frete mais barato é grátis.`],
            ['📏', 'Do P ao EXG', 'Confira a tabela de medidas na página de cada camisa antes de escolher.'],
          ].map(([icone, titulo, texto]) => (
            <div key={titulo} className="rounded-2xl border border-white/10 p-5">
              <span className="text-2xl">{icone}</span>
              <h3 className="mt-2 font-black uppercase">{titulo}</h3>
              <p className="mt-1 text-sm text-white/60">{texto}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-4xl px-4 pb-10 text-center text-xs text-white/40">
          Ofertas válidas de {DATA.format(BF.inicio)} a {DATA.format(BF.fim)} ou enquanto durar o estoque. O preço final é o mostrado no
          carrinho. O placar do duelo é só uma brincadeira entre torcidas.
        </p>
      </section>
    </main>
  );
}
