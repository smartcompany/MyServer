import { NextResponse } from "next/server";
import { readBotState, toBotStateApiError, writeBotState } from "@/lib/botStore";

export const runtime = "nodejs";

export async function GET() {
  try {
    const state = await readBotState();
    return NextResponse.json({
      isRunning: state.config.isRunning,
      logs: state.logs,
      botMeetingsCount: state.botMeetings.length,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}

export async function DELETE() {
  try {
    const state = await readBotState();
    const nextState = { ...state, logs: [] };
    await writeBotState(nextState);

    return NextResponse.json({
      ok: true,
      logs: [],
      botMeetingsCount: nextState.botMeetings.length,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
