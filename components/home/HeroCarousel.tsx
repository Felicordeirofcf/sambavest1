'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Permanent_Marker } from 'next/font/google';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation, EffectFade } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/effect-fade';

const marker = Permanent_Marker({ subsets: ['latin'], weight: '400' });

function PosterOverlay({ title, cta }: { title: string; cta: string }) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 -rotate-3 md:left-6 md:top-6">
      <p
        className={`${marker.className} text-xl leading-none text-[#F0DFA8] drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)] md:text-3xl lg:text-4xl`}
      >
        {title}
      </p>
      <p
        className={`${marker.className} mt-1 flex items-center gap-2 text-base leading-none text-[#5EC9C0] drop-shadow-[0_2px_5px_rgba(0,0,0,0.6)] md:text-xl lg:text-2xl`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[#C9A227] md:h-6 md:w-6">
          <path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8Zm2.2 12h13.6v1.6H5.2V20Z" />
        </svg>
        {cta}
      </p>
    </div>
  );
}

type Slide = {
  badge: string;
  title: string;
  subtitle: string;
  image: string;
  ctaText: string;
  ctaHref: string;
  fullImage?: boolean;
  poster?: { title: string; cta: string };
  overlayButtonText?: string;
};

const slides: Slide[] = [
  {
    badge: 'Samba Vest',
    title: 'A Paixão que Veste a Sua Escola!',
    subtitle: '',
    image: '/products/hero-paixao-carnaval.webp',
    ctaText: 'Ver Lançamento',
    ctaHref: '/categoria/lancamentos',
    fullImage: true,
  },
  {
    badge: 'Beija-Flor 2027',
    title: 'Beija-Flor 2027 — Garanta Já a Sua',
    subtitle: '',
    image: '/products/imagem1.jpg',
    ctaText: 'Ver Lançamento',
    ctaHref: '/categoria/lancamentos',
    fullImage: true,
    overlayButtonText: 'Clique Aqui',
  },
];

export default function HeroCarousel() {
  return (
    <section className="relative w-full overflow-hidden bg-[#0B1B34]">
      <Swiper
        modules={[Autoplay, Pagination, Navigation, EffectFade]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        speed={1500}
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        pagination={{ clickable: true }}
        navigation
        loop
        className="samba-hero-swiper"
      >
        {slides.map((slide, i) =>
          slide.fullImage ? (
            <SwiperSlide key={i}>
              <Link
                href={slide.ctaHref}
                aria-label={slide.title}
                // 🚀 USANDO ASPECT RATIO DINÂMICO: Adapta-se perfeitamente sem distorcer nenhuma das imagens
                className="relative block aspect-[16/9] w-full md:aspect-[21/9]"
              >
                <Image
                  src={slide.image}
                  alt={slide.title}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  // 🚀 object-contain garante que a imagem inteira apareça sem cortes nas pontas
                  className="object-contain bg-[#0B1B34] transition-transform duration-[10000ms] hover:scale-105"
                />

                {slide.poster && <PosterOverlay title={slide.poster.title} cta={slide.poster.cta} />}

                {slide.overlayButtonText && (
                  <div className="absolute bottom-6 right-6 z-20 md:bottom-10 md:right-16">
                    <span className="group inline-flex items-center gap-3 bg-[#C9A227] px-5 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.25em] text-[#0B1B34] shadow-[0_5px_20px_rgba(201,162,39,0.4)] transition-all duration-300 hover:scale-110 hover:bg-white md:px-8 md:py-3.5 md:text-[11px]">
                      {slide.overlayButtonText}
                      <svg
                        className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </span>
                  </div>
                )}
              </Link>
            </SwiperSlide>
          ) : (
            <SwiperSlide key={i}>
              <div className="relative flex min-h-[420px] w-full flex-col-reverse items-center justify-center gap-6 px-6 py-12 md:min-h-[500px] md:flex-row md:justify-between md:px-16">
                {/* Conteúdo secundário */}
              </div>
            </SwiperSlide>
          )
        )}
      </Swiper>

      <style jsx global>{`
        .samba-hero-swiper .swiper-pagination-bullet {
          background: #ffffff;
          opacity: 0.4;
          width: 8px;
          height: 8px;
          transition: all 0.3s;
        }
        .samba-hero-swiper .swiper-pagination-bullet-active {
          background: #c9a227;
          opacity: 1;
          width: 25px;
          border-radius: 4px;
        }
        .samba-hero-swiper .swiper-button-next,
        .samba-hero-swiper .swiper-button-prev {
          color: #c9a227;
          background: rgba(11, 27, 52, 0.6);
          width: 40px;
          height: 40px;
          border-radius: 50%;
          transition: all 0.3s;
        }
        .samba-hero-swiper .swiper-button-next:hover,
        .samba-hero-swiper .swiper-button-prev:hover {
          background: #c9a227;
          color: #0b1b34;
        }
        .samba-hero-swiper .swiper-button-next::after,
        .samba-hero-swiper .swiper-button-prev::after {
          font-size: 16px;
          font-weight: bold;
        }
        @media (max-width: 767px) {
          .samba-hero-swiper .swiper-button-next,
          .samba-hero-swiper .swiper-button-prev {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}