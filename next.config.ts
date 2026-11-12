import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 🚀 MÁGICA AQUI: Otimização extrema ativada (Imagens até 50% mais leves no mobile)
    // Só WebP: AVIF demora para gerar na primeira visita e gasta o dobro da cota de imagens da Vercel.
    formats: ['image/webp'],
    // Guarda a imagem otimizada por 30 dias (fotos de produto quase nunca mudam no mesmo endereço).
    minimumCacheTTL: 2_678_400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sambavest.com',
      },
      {
        protocol: 'https',
        hostname: 'www.sambavest.com',
      },
      {
        protocol: 'https',
        hostname: 'api.sambavest.com',
      }
    ],
  },
};

export default nextConfig;