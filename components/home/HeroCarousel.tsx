'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Permanent_Marker } from 'next/font/google';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

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
    // MUDANÇA AQUI: Alterado para minúsculo para garantir compatibilidade com o servidor
    image: '/products/beija-flor-2027-garanta-ja.png',
    ctaText: 'Ver Lançamento',
    ctaHref: '/categoria/lancamentos',
    fullImage: true,
    overlayButtonText: 'Clique Aqui',
  },
];

export default function HeroCarousel() {
  return (
    <section className="relative w-full overflow-hidden bg-gradient-to-br from-[#0B1B34] to-[#060F22]">
      <Swiper
        modules={[Autoplay, Pagination, Navigation]}
        autoplay={{ delay: 5500, disableOnInteraction: false }}
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
                className="relative block h-[420px] w-full md:h-[560px] lg:h-[640px]"
              >
                <Image
                  src={slide.image}
                  alt={slide.title}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className="object-contain"
                />

                {slide.poster && <PosterOverlay title={slide.poster.title} cta={slide.poster.cta} />}

                {slide.overlayButtonText && (
                  <div className="absolute bottom-10 right-4 z-20 md:bottom-20 md:right-16 lg:right-28">
                    <span className="group inline-flex items-center gap-3 bg-[#C9A227] px-6 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-[#0B1B34] shadow-[0_5px_15px_rgba(0,0,0,0.5)] transition-all duration-300 hover:bg-white hover:scale-105 md:px-8 md:py-4 md:text-[11px]">
                      {slide.overlayButtonText}
                      <svg
                        className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </span>
                  </div>
                )}
              </Link>
            </SwiperSlide>
          ) : (
            <SwiperSlide key={i}>
              <div className="relative flex min-h-[560px] w-full flex-col-reverse items-center justify-center gap-6 px-6 py-12 md:min-h-[640px] md:flex-row md:justify-between md:gap-10 md:px-16 lg:px-24">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[#C9A227]/20 blur-3xl md:h-[520px] md:w-[520px]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -left-24 bottom-0 h-[300px] w-[300px] rounded-full bg-[#C9A227]/10 blur-3xl"
                />

                <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center md:items-start md:text-left">
                  <span className="mb-4 inline-flex items-center rounded-full border border-[#C9A227]/50 bg-[#C9A227]/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-[#C9A227]">
                    {slide.badge}
                  </span>

                  <h1 className="font-heading text-2xl font-extrabold uppercase leading-tight tracking-tight text-white drop-shadow-md md:text-4xl lg:text-[42px]">
                    {slide.title}
                  </h1>

                  <p className="mt-4 text-sm leading-relaxed text-white/75 md:text-base">
                    {slide.subtitle}
                  </p>

                  <Link
                    href={slide.ctaHref}
                    className="group mt-8 inline-flex items-center gap-3 bg-[#C9A227] px-8 py-4 text-[11px] font-bold uppercase tracking-[0.25em] text-[#0B1B34] shadow-xl transition-all duration-300 hover:bg-white"
                  >
                    {slide.ctaText}
                    <svg
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>

                <div className="relative z-10 flex h-[280px] w-[240px] items-center justify-center md:h-[420px] md:w-[380px]">
                  <div className="absolute inset-0 rounded-full bg-white/5 blur-2xl" />
                  {slide.poster && <PosterOverlay title={slide.poster.title} cta={slide.poster.cta} />}
                  <Image
                    src={slide.image}
                    alt={slide.title}
                    fill
                    priority={i === 0}
                    sizes="(max-width: 768px) 240px, 380px"
                    className="object-contain drop-shadow-[0_25px_35px_rgba(0,0,0,0.45)]"
                  />
                </div>
              </div>
            </SwiperSlide>
          )
        )}
      </Swiper>

      <style jsx global>{`
        .samba-hero-swiper .swiper-pagination-bullet {
          background: #ffffff;
          opacity: 0.4;
        }
        .samba-hero-swiper .swiper-pagination-bullet-active {
          background: #c9a227;
          opacity: 1;
        }
        .samba-hero-swiper .swiper-button-next,
        .samba-hero-swiper .swiper-button-prev {
          color: #c9a227;
        }
        .samba-hero-swiper .swiper-button-next::after,
        .samba-hero-swiper .swiper-button-prev::after {
          font-size: 22px;
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