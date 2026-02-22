// LetsMeet Dashboard instrumentation
// Prevents parent RasberryHomeServer instrumentation.js from being used
// 시뮬레이터 폴링: 10초마다 runNow/isRunning 확인 후 tick 실행

const POLL_INTERVAL_MS = 10_000;
const HOURLY_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 5_000;

function log(...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [letsmeet-simulator]`, ...args);
}

function shouldRunTick(config: { runNow?: boolean; isRunning?: boolean; lastTickAt?: string } | null) {
  if (!config) return false;
  if (config.runNow === true) return true;
  if (!config.isRunning) return false;
  const last = config.lastTickAt ? new Date(config.lastTickAt).getTime() : 0;
  return Date.now() - last >= HOURLY_INTERVAL_MS;
}

async function poll(baseUrl: string, token: string) {
  try {
    const res = await fetch(`${baseUrl}/api/bot-config`, {
      cache: "no-store",
      headers: { "x-internal-simulator": token },
    });
    if (!res.ok) return;
    const json = await res.json();
    const config = json.config ?? null;
    if (!shouldRunTick(config)) return;

    log("tick 실행 중...");
    const tickRes = await fetch(`${baseUrl}/api/bot-control/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-simulator": token,
      },
    });
    const body = await tickRes.json();
    if (!tickRes.ok) {
      log("tick 오류:", (body as { error?: string }).error ?? tickRes.status);
      return;
    }
    log("tick 완료:", JSON.stringify(body));
  } catch (e) {
    log("poll/tick 오류:", e instanceof Error ? e.message : String(e));
  }
}

function startSimulatorPolling() {
  const token = process.env.DASHBOARD_TOKEN?.trim();
  if (!token) {
    console.warn("[letsmeet-simulator] DASHBOARD_TOKEN 없음, 시뮬레이터 폴링 비활성화");
    return;
  }
  const port = process.env.PORT || "3100";
  const baseUrl = `http://localhost:${port}`;
  log(`시작 (BASE_URL=${baseUrl}, POLL=${POLL_INTERVAL_MS}ms)`);

  setTimeout(() => {
    poll(baseUrl, token);
    setInterval(() => poll(baseUrl, token), POLL_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    startSimulatorPolling();
  }
}
