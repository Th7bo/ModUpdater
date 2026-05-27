import { signIn } from '@/src/auth'

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{
        background:
          'linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(180deg, rgba(124,58,237,0.04) 1px, transparent 1px), #080810',
        backgroundSize: '32px 32px',
      }}
    >
      <section
        className="w-full max-w-sm overflow-hidden"
        style={{
          border: '1px solid rgba(124,58,237,0.32)',
          borderRadius: '4px',
          background: '#0e0e1c',
          boxShadow: '0 0 60px rgba(124,58,237,0.14), 0 0 0 1px rgba(124,58,237,0.06)',
        }}
      >
        <div
          style={{
            borderBottom: '1px solid rgba(124,58,237,0.18)',
            background: 'rgba(124,58,237,0.06)',
            padding: '18px 22px',
          }}
          className="flex items-center gap-3"
        >
          <span className="brand-mark">MU</span>
          <div>
            <h1
              style={{ fontSize: '16px', fontWeight: 800, color: '#e4e4f4', letterSpacing: '-0.02em', lineHeight: 1.1 }}
            >
              ModUpdater
            </h1>
            <p style={{ fontSize: '11px', color: '#52527a', marginTop: '3px' }}>
              Fabric release operations
            </p>
          </div>
        </div>

        <div style={{ padding: '22px' }}>
          <p
            style={{ fontSize: '12px', color: '#8080a8', marginBottom: '18px', lineHeight: 1.55 }}
          >
            Sign in to access the build dashboard, manage repositories, and monitor artifact delivery.
          </p>

          <form
            action={async () => {
              'use server'
              await signIn('discord', { redirectTo: '/repos' })
            }}
          >
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minHeight: '44px', width: '100%', fontSize: '13px', letterSpacing: '0.02em' }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Sign in with Discord
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
