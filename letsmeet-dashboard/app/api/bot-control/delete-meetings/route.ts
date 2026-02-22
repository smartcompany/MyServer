import { NextRequest, NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError, writeBotState } from "@/lib/botStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let state: Awaited<ReturnType<typeof readBotState>> | null = null;
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (level: "info" | "warn" | "error", message: string) => {
    if (!state) return;
    state = appendLog(state, {
      level,
      message: `[delete-meetings:${requestId}] ${message}`,
    });
  };

  try {
    state = await readBotState();
    const body = (await request.json().catch(() => ({}))) as { uids?: unknown };
    const requestedUids = Array.isArray(body.uids) ? body.uids.filter((v): v is string => typeof v === "string") : [];
    const targetUids = requestedUids.length > 0 ? requestedUids : state.config.selectedBotUids;
    const preservedSelectedUids =
      requestedUids.length > 0 ? [...new Set(requestedUids)] : [...state.config.selectedBotUids];

    if (targetUids.length === 0) {
      log("warn", "삭제 대상 봇이 없어 요청 거부");
      await writeBotState(state);
      return NextResponse.json({ error: "삭제할 봇 계정을 선택하세요." }, { status: 400 });
    }

    log("info", `봇 모임 삭제 시작: bots=${targetUids.length}`);

    const { error: deleteError, count: deletedInDb } = await supabaseAdmin
      .from("letsmeet_meetings")
      .delete({ count: "exact" })
      .in("host_id", targetUids);

    if (deleteError) {
      log("error", `DB 삭제 실패: ${deleteError.message}`);
      await writeBotState(state);
      return NextResponse.json({ error: `모임 삭제 실패: ${deleteError.message}` }, { status: 500 });
    }

    const before = state.botMeetings.length;
    state.botMeetings = state.botMeetings.filter((meeting) => !targetUids.includes(meeting.hostUid));
    const deletedInState = before - state.botMeetings.length;

    for (const uid of targetUids) {
      delete state.weeklyCounters[uid];
    }

    log(
      "warn",
      `봇 모임 삭제 완료: bots=${targetUids.length}, deletedInDb=${deletedInDb ?? 0}, deletedInState=${deletedInState}`
    );
    // Keep current bot selection intact after deletion.
    state.config.selectedBotUids = preservedSelectedUids;
    state.config.updatedAt = new Date().toISOString();
    await writeBotState(state);

    return NextResponse.json({
      ok: true,
      deletedInDb: deletedInDb ?? 0,
      deletedInState,
      bots: targetUids.length,
      config: state.config,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    log("error", `봇 모임 삭제 예외: ${apiError.error}`);
    if (state) await writeBotState(state);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
