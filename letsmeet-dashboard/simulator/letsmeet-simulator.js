/**
 * LetsMeet 봇 시뮬레이터 - pm2로 상시 실행
 * - 10초마다 bot-state 폴링
 * - runNow이면 즉시 tick 실행
 * - isRunning이고 마지막 tick이 1시간 지났으면 tick 실행
 * - 실제 tick은 대시보드 API (POST /api/bot-control/simulate)에 x-internal-simulator 헤더로 호출
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = process.env.DASHBOARD_BASE_URL || "http://localhost:3100";
const TOKEN = process.env.DASHBOARD_TOKEN;
const POLL_INTERVAL_MS = 10_000;
const HOURLY_INTERVAL_MS = 60 * 60 * 1000;

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [letsmeet-simulator]`, ...args);
}

async function getConfig() {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/bot-config`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "x-internal-simulator": TOKEN },
  });
  if (!res.ok) {
    throw new Error(`bot-config ${res.status}`);
  }
  const json = await res.json();
  return json.config || {};
}

async function runTick() {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/bot-control/simulate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-simulator": TOKEN,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `simulate ${res.status}`);
  }
  return body;
}

function shouldRunTick(config) {
  if (!config) return false;
  if (config.runNow === true) return true;
  if (!config.isRunning) return false;
  const last = config.lastTickAt ? new Date(config.lastTickAt).getTime() : 0;
  return Date.now() - last >= HOURLY_INTERVAL_MS;
}

async function poll() {
  try {
    const config = await getConfig();
    if (shouldRunTick(config)) {
      log("tick 실행 중...");
      const result = await runTick();
      log("tick 완료:", JSON.stringify(result));
    }
  } catch (e) {
    log("poll/tick 오류:", e.message);
  }
}

function main() {
  if (!TOKEN) {
    console.error("[letsmeet-simulator] DASHBOARD_TOKEN이 필요합니다.");
    process.exit(1);
  }
  log(`시작 (BASE_URL=${BASE_URL}, POLL=${POLL_INTERVAL_MS}ms)`);
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main();
