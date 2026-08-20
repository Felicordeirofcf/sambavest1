'use client';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B1B34]">
      <div className="flex flex-col items-center">
        <div className="relative">
          <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase tracking-[0.3em] text-white animate-pulse">
            Samba Vest
          </h2>

          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 h-[2px] bg-[#C9A227] animate-loader-line"></div>
        </div>

        <p className="mt-10 text-[10px] uppercase tracking-[0.2em] text-white/50">
          Preparando o desfile...
        </p>
      </div>

      <style jsx>{`
        @keyframes loader-line {
          0% { width: 0; opacity: 0; }
          50% { width: 100%; opacity: 1; }
          100% { width: 0; opacity: 0; }
        }
        .animate-loader-line {
          animation: loader-line 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
