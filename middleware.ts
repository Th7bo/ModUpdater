import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/src/auth.config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  if (
    nextUrl.pathname.startsWith('/api/auth') ||
    nextUrl.pathname.startsWith('/api/webhooks')
  ) {
    return NextResponse.next()
  }

  if (nextUrl.pathname.startsWith('/api/')) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  if (!isLoggedIn && nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
