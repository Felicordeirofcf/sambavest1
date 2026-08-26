import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 🚀 MÁGICA AQUI: Otimização extrema ativada (Imagens até 50% mais leves no mobile)
    formats: ['image/avif', 'image/webp'], 
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