import { NextResponse } from "next/server";
import { clearBotLogs, readBotLogs, toBotStateApiError } from "@/lib/botStore";

export const runtime = "nodejs";

export async function GET() {
  try {
    const logs = await readBotLogs();
    return NextResponse.json({
      isRunning: false,
      logs,
      botMeetingsCount: 0,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}

export async function DELETE() {
  try {
    await clearBotLogs();
    return NextResponse.json({
      ok: true,
      logs: [],
      botMeetingsCount: 0,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
