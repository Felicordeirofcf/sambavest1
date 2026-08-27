'use client';

import React, { useEffect } from 'react';

export default function InstagramReels() {
  // 🚀 O script do Instagram lê esses embeds e os transforma nos players oficiais automaticamente
  useEffect(() => {
    // Carrega o script do Instagram caso ele ainda não exista na página
    if (!(window as any).instgrm) {
      const script = document.createElement('script');
      script.async = true;
      script.src = '//www.instagram.com/embed.js';
      document.body.appendChild(script);
    } else {
      (window as any).instgrm.Embeds.process();
    }
  }, []);

  return (
    <section className="py-16 bg-[#FAF7EF] border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Cabeçalho da Seção */}
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#C9A227] bg-[#0B1B34] px-3 py-1.5 rounded-sm shadow-sm">
            @sambavest no Instagram
          </span>
          <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mt-3">
            Quem veste Samba Vest brilha mais! 🥁✨
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            Acompanhe nossos bastidores, lançamentos e os mantos desfilando na rua e na avenida.
          </p>
        </div>

        {/* Grid com os 3 Embeds Oficiais do Instagram */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 justify-items-center">
          
          {/* Post 1 */}
          <div className="w-full flex justify-center overflow-hidden rounded-2xl shadow-md bg-white p-2 border border-gray-200">
            <blockquote 
              className="instagram-media" 
              data-instgrm-permalink="https://www.instagram.com/p/DXPRe7-jY48/?utm_source=ig_embed&amp;utm_campaign=loading" 
              data-instgrm-version="14"
              style={{ background: '#FFF', border: '0', borderRadius: '12px', margin: '0', maxWidth: '540px', width: '100%' }}
            >
              <a href="https://www.instagram.com/p/DXPRe7-jY48/?utm_source=ig_embed&amp;utm_campaign=loading" target="_blank" rel="noopener noreferrer">
                Ver esta publicação no Instagram
              </a>
            </blockquote>
          </div>

          {/* Post 2 */}
          <div className="w-full flex justify-center overflow-hidden rounded-2xl shadow-md bg-white p-2 border border-gray-200">
            <blockquote 
              className="instagram-media" 
              data-instgrm-permalink="https://www.instagram.com/p/DcghXsUF0Bq/?utm_source=ig_embed&amp;utm_campaign=loading" 
              data-instgrm-version="14"
              style={{ background: '#FFF', border: '0', borderRadius: '12px', margin: '0', maxWidth: '540px', width: '100%' }}
            >
              <a href="https://www.instagram.com/p/DcghXsUF0Bq/?utm_source=ig_embed&amp;utm_campaign=loading" target="_blank" rel="noopener noreferrer">
                Ver esta publicação no Instagram
              </a>
            </blockquote>
          </div>

          {/* Post 3 */}
          <div className="w-full flex justify-center overflow-hidden rounded-2xl shadow-md bg-white p-2 border border-gray-200">
            <blockquote 
              className="instagram-media" 
              data-instgrm-permalink="https://www.instagram.com/p/DcKAgxvPneo/?utm_source=ig_embed&amp;utm_campaign=loading" 
              data-instgrm-version="14"
              style={{ background: '#FFF', border: '0', borderRadius: '12px', margin: '0', maxWidth: '540px', width: '100%' }}
            >
              <a href="https://www.instagram.com/p/DcKAgxvPneo/?utm_source=ig_embed&amp;utm_campaign=loading" target="_blank" rel="noopener noreferrer">
                Ver esta publicação no Instagram
              </a>
            </blockquote>
          </div>

        </div>

        {/* Botão de Seguir */}
        <div className="mt-12 text-center">
          <a
            href="https://www.instagram.com/sambavest/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#0B1B34] text-[#C9A227] hover:bg-[#C9A227] hover:text-[#0B1B34] font-bold text-xs uppercase tracking-widest px-8 py-4 rounded-xl shadow-md transition-all duration-300"
          >
            Siga @sambavest no Instagram
          </a>
        </div>

      </div>
    </section>
  );
}