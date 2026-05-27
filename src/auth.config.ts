import type { NextAuthConfig } from 'next-auth'

// Edge-safe config: no db imports, no Node.js-only modules.
// Used by middleware.ts to validate JWT sessions in the Edge runtime.
// The full auth config (with db adapter + providers) lives in src/auth.ts.
export const authConfig = {
  providers: [],
  pages: { signIn: '/login' },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
  },
} satisfies NextAuthConfig
