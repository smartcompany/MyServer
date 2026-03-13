import { NextRequest, NextResponse } from "next/server";
import { appendLog, readBotState, writeBotState } from "@/lib/botStore";

export const runtime = "nodejs";

/** UI/외부에서 "1회 시뮬레이션" 요청 시 runNow만 설정. 실제 tick은 letsmeet-simulator 폴링이 처리. */
export async function POST(request: NextRequest) {
  const expectedToken = process.env.DASHBOARD_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "Server misconfigured: DASHBOARD_TOKEN is not set" },
      { status: 500 }
    );
  }

  const providedToken = request.headers.get("x-dashboard-token")?.trim();
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await readBotState();
  const body = await request.json().catch(() => ({})) as { selectedBotUids?: unknown };
  if (Array.isArray(body.selectedBotUids)) {
    const uids = body.selectedBotUids.filter((v): v is string => typeof v === "string" && v.length > 0);
    state.config.selectedBotUids = [...new Set(uids)];
  }
  state.config.runNow = true;
  state.config.updatedAt = new Date().toISOString();
  await writeBotState(state);
  await appendLog({
    level: "info",
    message: `1회 시뮬레이션 트리거됨 (선택 봇 ${state.config.selectedBotUids.length}개) - 폴링이 tick을 실행할 때까지 기다려주세요 (최대 ~10초).`,
  });
  return NextResponse.json({ ok: true, triggered: true });
}
