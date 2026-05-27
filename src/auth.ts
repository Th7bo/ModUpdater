import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

import { authConfig } from '@/src/auth.config'
import { db } from '@/src/db/client'
import { parseConfig } from '@/src/config/env'
import { users, accounts, sessions, verificationTokens } from '@/src/db/schema'

const envConfig = parseConfig()

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: envConfig.GOOGLE_CLIENT_ID,
      clientSecret: envConfig.GOOGLE_CLIENT_SECRET,
    }),
    Resend({
      apiKey: envConfig.RESEND_API_KEY,
      from: envConfig.AUTH_EMAIL_FROM,
    }),
  ],
  session: { strategy: 'jwt' },
})
