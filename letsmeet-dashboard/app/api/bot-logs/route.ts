import { NextResponse } from "next/server";
import { clearBotLogs, readBotLogs, readBotState, toBotStateApiError } from "@/lib/botStore";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [state, logs] = await Promise.all([readBotState(), readBotLogs()]);
    return NextResponse.json({
      isRunning: state.config.isRunning,
      logs,
      botMeetingsCount: state.botMeetings.length,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}

export async function DELETE() {
  try {
    await clearBotLogs();
    const state = await readBotState();
    return NextResponse.json({
      ok: true,
      logs: [],
      botMeetingsCount: state.botMeetings.length,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
