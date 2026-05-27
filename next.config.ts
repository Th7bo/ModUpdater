import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',

  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'zlib-sync': false,
      bufferutil: false,
      'utf-8-validate': false,
    }

    return config
  },
}

export default nextConfig