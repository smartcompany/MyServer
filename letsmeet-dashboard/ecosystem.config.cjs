/**
 * PM2 설정 - 라즈베리 파이 등에서 사용
 * $ pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "letsmeet-dashboard",
      cwd: __dirname,
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production" },
    },
  ],
};
