import { NextRequest, NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError, writeBotState } from "@/lib/botStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const state = await readBotState();
    const { data: botRows } = await supabaseAdmin
      .from("letsmeet_users")
      .select("user_id")
      .eq("is_bot", true);
    const selectedBotUids = (botRows ?? []).map((r) => r.user_id as string);
    const config = {
      ...state.config,
      selectedBotUids,
    };
    return NextResponse.json({ config });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const state = await readBotState();

    // selectedBotUids는 letsmeet_users.is_bot으로만 관리. PUT에서는 변경하지 않음.
    state.config = {
      ...state.config,
      meetingsPerWeekPerBot:
        typeof body.meetingsPerWeekPerBot === "number"
          ? Math.max(0, Math.min(14, body.meetingsPerWeekPerBot))
          : state.config.meetingsPerWeekPerBot,
      creatorRatio:
        typeof body.creatorRatio === "number"
          ? Math.max(0, Math.min(1, body.creatorRatio))
          : state.config.creatorRatio,
      applicationsPerRunPerBot:
        typeof body.applicationsPerRunPerBot === "number"
          ? Math.max(0, Math.min(10, body.applicationsPerRunPerBot))
          : state.config.applicationsPerRunPerBot,
      applyOnlyToBotMeetings:
        typeof body.applyOnlyToBotMeetings === "boolean"
          ? body.applyOnlyToBotMeetings
          : state.config.applyOnlyToBotMeetings,
      updatedAt: new Date().toISOString(),
    };

    await appendLog({
      level: "info",
      message: `봇 설정 저장: bots=${state.config.selectedBotUids.length}, weekly=${state.config.meetingsPerWeekPerBot}, creatorRatio=${state.config.creatorRatio}, applyN=${state.config.applicationsPerRunPerBot}`,
    });
    await writeBotState(state);
    return NextResponse.json({ config: state.config });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
