// Decide se uma imagem pode passar pelo otimizador do Next (next/image).
// Só otimiza imagens locais (/products/...) ou dos domínios liberados em next.config.ts.
// Para qualquer outro domínio, a imagem é exibida como está (sem quebrar a página).
const HOSTS_OTIMIZADOS = ['sambavest.com', 'www.sambavest.com', 'api.sambavest.com'];

export function podeOtimizar(src: string | undefined | null): boolean {
  if (!src) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && HOSTS_OTIMIZADOS.includes(u.hostname);
  } catch {
    return false;
  }
}
