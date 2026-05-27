import { signIn } from '@/src/auth'

export default function LoginPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-6">Sign in to ModUpdater</h1>

        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/repos' })
          }}
        >
          <button type="submit" className="btn btn-primary w-full justify-center py-2.5">
            Sign in with Google
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <hr className="flex-1 border-slate-200" />
          <span className="text-xs text-slate-400 uppercase tracking-wide">or</span>
          <hr className="flex-1 border-slate-200" />
        </div>

        <form
          action={async (formData: FormData) => {
            'use server'
            const email = formData.get('email')
            if (typeof email !== 'string' || !email) return
            await signIn('resend', { email, redirectTo: '/repos' })
          }}
        >
          <div className="flex flex-col gap-1.5 mb-4">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              className="px-3 py-2 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button type="submit" className="btn btn-primary w-full justify-center py-2.5">
            Send magic link
          </button>
        </form>
      </div>
    </main>
  )
}
