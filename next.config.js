/** @type {import('next').NextConfig} */
const DASHBOARD_PORT = process.env.LETSMEET_DASHBOARD_PORT || 3100;

const nextConfig = {
  // output: 'standalone', // instrumentation hook과 호환성 문제로 제거
  async rewrites() {
    return [
      {
        source: "/letsmeet-dashboard",
        destination: `http://localhost:${DASHBOARD_PORT}/letsmeet-dashboard`,
      },
      {
        source: "/letsmeet-dashboard/:path*",
        destination: `http://localhost:${DASHBOARD_PORT}/letsmeet-dashboard/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

