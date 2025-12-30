import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth } from '@clerk/nextjs/server'; // Exemplo usando Clerk

export async function middleware(request: NextRequest) {
  const { userId } = getAuth(request);

  // Se tentar acessar o /dashboard sem estar logado
  if (!userId && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Aqui você pode adicionar uma lógica para checar o banco de dados
  // Se o usuário logado não tiver stripeStatus === 'active', 
  // você pode redirecioná-lo para a página de preços.
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/premium/:path*'],
};
