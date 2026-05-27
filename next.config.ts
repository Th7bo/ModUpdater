import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',

  serverExternalPackages: [
    'discord.js',
    '@discordjs/rest',
    '@discordjs/ws',
    '@discordjs/collection',
  ],
}

export default nextConfig