/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 정적 파일 서빙을 위한 설정
  async rewrites() {
    return [
      {
        source: '/dashboard',
        destination: '/dashboard/index.html',
      },
      {
        source: '/trade',
        destination: '/trade/index.html',
      },
    ];
  },
};

module.exports = nextConfig;

