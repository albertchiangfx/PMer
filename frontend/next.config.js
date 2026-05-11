/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api',
  },
  // NAS / 網路磁碟上 .next/cache 的 webpack pack rename 常 ENOENT；關閉持久快取可避免。
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
  /**
   * 當 NEXT_PUBLIC_API_URL 為同源 `/api`（見 repo `.env.example`）時，瀏覽器會打到 Next 本機埠，
   * 必須把 `/api/*` 轉發到 Express，否則里程碑等請求會得到 Next 的 404。
   * Docker + nginx 正式環境由 nginx 直接轉發 `/api/`，通常不會走到這條規則。
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';
    return {
      beforeFiles: [{ source: '/api/:path*', destination: `${target}/api/:path*` }],
    };
  },
};
module.exports = nextConfig;
