/** @type {import('next').NextConfig} */
const isStrictSecurityMode = process.env.SECURITY_HEADERS_MODE === 'strict'

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  assetPrefix: process.env.BASE_PATH || '',
  basePath: process.env.BASE_PATH || '',
  trailingSlash: true,
  // Avoid 308 redirects (some scanners flag missing headers on redirects)
  skipTrailingSlashRedirect: true,
  async headers() {
    // Some internal Next routes (e.g. /_next/image) may not reliably pick up middleware headers
    // depending on runtime/route handling. Setting baseline security headers here ensures coverage.
    return [
      // Next page data endpoints should always be served as JSON (avoid MIME sniffing).
      {
        source: '/_next/data/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/json; charset=utf-8' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          // HSTS is meaningful only over HTTPS (kept for parity with middleware; harmless on HTTP)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
  images: {
    // Next.js image optimizer endpoint `/_next/image` does not consistently include custom security headers
    // (e.g. X-Content-Type-Options) and may bypass middleware/next.config headers.
    // In strict security scanning mode, disable optimization so pages won't hit `/_next/image` at all.
    unoptimized: isStrictSecurityMode,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Deploy build should not fail on formatting-only lint issues.
  // Run `npm run lint` / `npm run format` in CI or locally instead.
  eslint: {
    ignoreDuringBuilds: true,
  },
  publicRuntimeConfig: {
    root: process.env.BASE_PATH || '',
  },
  optimizeFonts: false,
  // MediaPipe 套件需要被 transpile
  transpilePackages: ['@mediapipe/tasks-vision'],
  // Webpack 配置以支援 MediaPipe
  webpack: (config, { isServer }) => {
    // 確保 MediaPipe 在客戶端和服務端都能正確解析
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }

    // 處理 MediaPipe 的 WASM 檔案
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    })

    return config
  },
}

module.exports = nextConfig
