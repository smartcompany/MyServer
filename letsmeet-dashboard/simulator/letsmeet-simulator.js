/**
 * LetsMeet 봇 시뮬레이터 - 폴링 담당
 * - 10초마다 bot-config 폴링
 * - runNow: consume 후 tick 1회 실행 (한 번만)
 * - isRunning + 1시간 주기: tick 실행
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = (process.env.DASHBOARD_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const BASE_PATH = "/letsmeet-dashboard";
const TOKEN = process.env.DASHBOARD_TOKEN;
const POLL_INTERVAL_MS = 10_000;
const HOURLY_INTERVAL_MS = 60 * 60 * 1000;

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [letsmeet-simulator]`, ...args);
}

const api = (path) => `${BASE_URL}${BASE_PATH}${path}`;

async function getConfig() {
  const res = await fetch(api("/api/bot-config"), {
    cache: "no-store",
    headers: { "x-internal-simulator": TOKEN },
  });
  if (!res.ok) throw new Error(`bot-config ${res.status}`);
  const json = await res.json();
  return json.config || {};
}

async function consumeRunNow() {
  const res = await fetch(api("/api/bot-control/consume-run-now"), {
    method: "POST",
    headers: { "x-internal-simulator": TOKEN },
  });
  const body = await res.json();
  return body.consumed === true;
}

async function runTick(trigger) {
  const res = await fetch(api("/api/bot-control/simulate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-simulator": TOKEN,
      "x-simulate-trigger": trigger,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `simulate ${res.status}`);
  return body;
}

function shouldRunTick(config) {
  if (!config) return false;
  if (config.runNow === true) return { run: true, trigger: "runNow" };
  if (!config.isRunning) return false;
  const last = config.lastTickAt ? new Date(config.lastTickAt).getTime() : 0;
  if (Date.now() - last < HOURLY_INTERVAL_MS) return false;
  return { run: true, trigger: "hourly" };
}

async function poll() {
  try {
    const config = await getConfig();
    const decision = shouldRunTick(config);
    if (!decision) return;

    if (decision.trigger === "runNow") {
      const consumed = await consumeRunNow();
      if (!consumed) return;
    }

    log(decision.trigger, "→ tick 실행 중...");
    const result = await runTick(decision.trigger);
    log("tick 완료:", JSON.stringify(result));
  } catch (e) {
    log("poll/tick 오류:", e.message);
  }
}

const STARTUP_DELAY_MS = 5_000;

function startSimulator() {
  if (!TOKEN) {
    console.warn("[letsmeet-simulator] DASHBOARD_TOKEN 없음, 폴링 비활성화");
    return;
  }
  setTimeout(async () => {
    try {
      await consumeRunNow();
    } catch (e) {
      log("시작 시 runNow 초기화 스킵:", e.message);
    }
    log(`시작 (BASE_URL=${BASE_URL}${BASE_PATH}, POLL=${POLL_INTERVAL_MS}ms)`);
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

module.exports = { startSimulator };
