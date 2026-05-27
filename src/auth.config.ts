import type { NextAuthConfig } from 'next-auth'

export type UserRole = 'user' | 'admin'

declare module 'next-auth' {
  interface User {
    role?: UserRole
  }
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: UserRole
    }
  }
}

// Edge-safe config: no db imports, no Node.js-only modules.
// Used by middleware.ts to validate JWT sessions in the Edge runtime.
// The full auth config (with db adapter + providers) lives in src/auth.ts.
export const authConfig = {
  providers: [],
  pages: { signIn: '/login' },
  trustHost: true,
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    jwt({ token, user }) {
      if (user?.role) {
        (token as Record<string, unknown>).role = user.role
      }
      return token
    },
    session({ session, token }) {
      const role = (token as Record<string, unknown>).role as UserRole | undefined
      if (role) {
        session.user.role = role
      }
      return session
    },
  },
} satisfies NextAuthConfig
