import { signIn } from '@/src/auth'

export default function LoginPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '400px', margin: '4rem auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>Sign in to ModUpdater</h1>

      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/' })
        }}
        style={{ marginBottom: '1.5rem' }}
      >
        <button type="submit" style={{ width: '100%', padding: '0.75rem', cursor: 'pointer' }}>
          Sign in with Google
        </button>
      </form>

      <hr style={{ margin: '1.5rem 0' }} />

      <form
        action={async (formData: FormData) => {
          'use server'
          const email = formData.get('email')
          if (typeof email !== 'string' || !email) return
          await signIn('resend', { email, redirectTo: '/' })
        }}
      >
        <label htmlFor="email" style={{ display: 'block', marginBottom: '0.5rem' }}>
          Email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          placeholder="you@example.com"
          required
          style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', boxSizing: 'border-box' }}
        />
        <button type="submit" style={{ width: '100%', padding: '0.75rem', cursor: 'pointer' }}>
          Send magic link
        </button>
      </form>
    </main>
  )
}
