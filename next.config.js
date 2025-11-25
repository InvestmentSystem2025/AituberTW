/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  assetPrefix: process.env.BASE_PATH || '',
  basePath: process.env.BASE_PATH || '',
  trailingSlash: true,
  publicRuntimeConfig: {
    root: process.env.BASE_PATH || '',
  },
  optimizeFonts: false,
  // MediaPipe 套件需要被 transpile
  transpilePackages: ['@mediapipe/tasks-vision'],
  // Webpack 配置以支援 MediaPipe
  webpack: (config, { isServer }) => {
    // 排除 mcp-server 目錄，避免編譯時錯誤
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/mcp-server/**'],
    }

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
