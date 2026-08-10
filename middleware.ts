import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/src/auth.config'

const { auth } = NextAuth(authConfig)

// Public routes that don't require authentication
const publicRoutes = [
  '/api/auth',
  '/api/webhooks',
  '/api/artifacts', // Artifact downloads are public (accessed via Discord)
  '/api/manifest',  // Client updater manifest — guarded by its own bearer token (§12.4)
  '/api/health',    // Health check for monitoring
  '/install',       // Bootstrap scripts (covers /install and /install.ps1)
  '/login',
]

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  // Check if route is public
  const isPublicRoute = publicRoutes.some((route) =>
    nextUrl.pathname.startsWith(route)
  )

  if (isPublicRoute) {
    return NextResponse.next()
  }

  // API routes require auth
  if (nextUrl.pathname.startsWith('/api/')) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Dashboard routes require auth
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
