import NextAuth from 'next-auth'
import Discord from 'next-auth/providers/discord'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'

import { authConfig, type UserRole } from '@/src/auth.config'
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
    Discord({
      clientId: envConfig.DISCORD_CLIENT_ID,
      clientSecret: envConfig.DISCORD_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      const tokenRecord = token as Record<string, unknown>
      if (user) {
        // Initial sign in - fetch role from DB
        try {
          const dbUser = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, user.id!))
            .limit(1)
          tokenRecord.role = (dbUser[0]?.role as UserRole) ?? 'user'
        } catch {
          tokenRecord.role = 'user'
        }
      }
      if (trigger === 'update') {
        // Session update - refetch role
        try {
          const dbUser = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, token.sub!))
            .limit(1)
          tokenRecord.role = (dbUser[0]?.role as UserRole) ?? 'user'
        } catch {
          tokenRecord.role = tokenRecord.role ?? 'user'
        }
      }
      return token
    },
    session({ session, token }) {
      const role = (token as Record<string, unknown>).role as UserRole | undefined
      session.user.role = role ?? 'user'
      return session
    },
  },
})
