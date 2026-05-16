import { NextResponse } from 'next/server';
import { unsealData } from 'iron-session';

const PUBLIC = ['/api/login', '/api/logout', '/api/webhook', '/api/reset', '/api/debug', '/login'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get('callsheet_session')?.value;
  if (!cookie) return NextResponse.redirect(new URL('/login', req.url));

  try {
    await unsealData(cookie, { password: process.env.SESSION_SECRET || 'conecta-secret-key-32-chars-min!!!' });
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
