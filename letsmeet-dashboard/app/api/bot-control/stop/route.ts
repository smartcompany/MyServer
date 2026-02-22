import { NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError, writeBotState } from "@/lib/botStore";

export const runtime = "nodejs";

export async function POST() {
  try {
    const state = await readBotState();
    state.config.isRunning = false;
    state.config.updatedAt = new Date().toISOString();

    await appendLog({
      level: "warn",
      message: "AI 봇 진행 중지",
    });
    await writeBotState(state);
    return NextResponse.json({ ok: true, config: state.config });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
