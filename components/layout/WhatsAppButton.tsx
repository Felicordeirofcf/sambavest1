'use client';

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5521996959903'; // troque no .env.local

export default function WhatsAppButton() {
  const message = encodeURIComponent(
    'Olá! Vim pelo site da Samba Vest e gostaria de mais informações sobre as camisas de enredo.'
  );

  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="group fixed bottom-5 right-5 z-50 flex items-center"
    >
      <span className="mr-3 hidden rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-[#0B1B34] shadow-lg backdrop-blur md:inline-flex">
        Fale conosco
      </span>

      <span className="absolute inset-0 rounded-full bg-green-500 blur-xl opacity-30 transition-opacity duration-300 group-hover:opacity-50" />

      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-[0_10px_30px_rgba(34,197,94,0.35)] transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_14px_38px_rgba(34,197,94,0.45)]">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-20" />

        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 32 32"
          className="relative z-10 h-8 w-8 fill-white"
        >
          <path d="M19.11 17.21c-.29-.15-1.72-.85-1.98-.95-.27-.1-.46-.15-.66.15-.19.29-.76.95-.93 1.14-.17.2-.34.22-.63.08-.29-.15-1.23-.45-2.34-1.43-.86-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.59.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.44 0 1.44 1.05 2.83 1.2 3.02.15.2 2.06 3.14 5.08 4.28.72.31 1.28.49 1.72.63.72.23 1.37.2 1.89.12.58-.09 1.72-.7 1.97-1.37.24-.66.24-1.22.17-1.34-.07-.12-.26-.2-.56-.34Z" />
          <path d="M16.03 3.2c-6.95 0-12.58 5.62-12.58 12.56 0 2.21.58 4.37 1.68 6.27L3.2 28.8l6.95-1.82a12.6 12.6 0 0 0 5.88 1.49h.01c6.94 0 12.57-5.63 12.57-12.57 0-3.36-1.31-6.52-3.69-8.89A12.48 12.48 0 0 0 16.03 3.2Zm0 22.99h-.01a10.4 10.4 0 0 1-5.3-1.45l-.38-.22-4.13 1.08 1.1-4.03-.25-.41a10.28 10.28 0 0 1-1.58-5.42c0-5.7 4.65-10.34 10.37-10.34 2.76 0 5.35 1.07 7.3 3.03a10.25 10.25 0 0 1 3.03 7.3c0 5.71-4.65 10.36-10.35 10.36Z" />
        </svg>
      </span>
    </a>
  );
}
