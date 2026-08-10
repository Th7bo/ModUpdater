import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',

  serverExternalPackages: [
    'discord.js',
    '@discordjs/rest',
    '@discordjs/ws',
    '@discordjs/collection',
  ],

  async headers() {
    return [
      {
        // The bootstrap scripts must never be cached: a stale copy installs an
        // old updater and hides a fix that already shipped. They are tiny, so
        // revalidating every time costs nothing.
        source: '/:path(install|install.ps1)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        ],
      },
    ]
  },
}

export default nextConfig