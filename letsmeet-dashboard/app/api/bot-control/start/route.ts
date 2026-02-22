import { NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError, writeBotState } from "@/lib/botStore";

export const runtime = "nodejs";

export async function POST() {
  try {
    const state = await readBotState();
    state.config.isRunning = true;
    state.config.updatedAt = new Date().toISOString();

    await appendLog({
      level: "info",
      message: `AI 봇 진행 시작 (선택 봇 ${state.config.selectedBotUids.length}개)`,
    });
    await writeBotState(state);
    return NextResponse.json({ ok: true, config: state.config });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
