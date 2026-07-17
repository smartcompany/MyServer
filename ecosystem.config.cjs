/**
 * PM2 설정 - 루트에서 메인 서버 실행
 * $ pm2 start ecosystem.config.cjs
 *
 * 메인 서버: 포트 3000 (기본)
 */
module.exports = {
  apps: [
    {
      name: "myserver",
      cwd: __dirname,
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production" },
    },
  ],
};
