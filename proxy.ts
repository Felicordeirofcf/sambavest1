// Durante a Black Friday (11/11 a 30/11) a página inicial e as categorias levam para /black-friday.
// Produto, sacola, checkout e pedidos continuam abertos (a compra passa por eles).
// Depois de 30/11 às 23h59 (Brasília) o site volta ao normal sozinho, sem novo deploy.
import { NextResponse, type NextRequest } from 'next/server';
import { faseBF } from './lib/blackfridayPeriodo';

export function proxy(request: NextRequest) {
  if (faseBF() !== 'durante') return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/black-friday';
  // 307: redirecionamento temporário (o Google não troca a página inicial de vez)
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/', '/categoria/:path*'],
};
