/**
 * PM2 설정 - 루트에서 메인 서버 + LetsMeet 대시보드 + 시뮬레이터 동시 실행
 * $ pm2 start ecosystem.config.cjs
 *
 * 메인 서버: 포트 3000 (기본)
 * LetsMeet 대시보드: 포트 3100 (/letsmeet-dashboard 로 프록시)
 */
const path = require("path");

module.exports = {
  apps: [
    {
      name: "myserver",
      cwd: __dirname,
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production" },
    },
    {
      name: "letsmeet-dashboard",
      cwd: path.join(__dirname, "letsmeet-dashboard"),
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production", PORT: 3100 },
    },
    {
      name: "letsmeet-simulator",
      cwd: path.join(__dirname, "letsmeet-dashboard"),
      script: "simulator/letsmeet-simulator.js",
      interpreter: "node",
      env: { NODE_ENV: "production" },
    },
  ],
};
