declare module 'next/server' {
  export const NextResponse: any;
  export type NextRequest = any;
}

declare module 'next/headers' {
  export function headers(): any;
}

declare module '@clerk/nextjs/server';

declare module 'react';

declare module 'react-dom';
