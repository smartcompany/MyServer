import { NextRequest, NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError, writeBotState } from "@/lib/botStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let state: Awaited<ReturnType<typeof readBotState>> | null = null;
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = async (level: "info" | "warn" | "error", message: string) => {
    await appendLog({
      level,
      message: `[delete-meetings:${requestId}] ${message}`,
    });
  };

  try {
    const body = (await request.json().catch(() => ({}))) as { uids?: unknown };
    const requestedUids = Array.isArray(body.uids) ? body.uids.filter((v): v is string => typeof v === "string") : [];
    const targetUids = requestedUids.length > 0 ? requestedUids : [];

    if (targetUids.length === 0) {
      await log("warn", "삭제 대상 봇이 없어 요청 거부");
      return NextResponse.json({ error: "삭제할 봇 계정을 선택하세요." }, { status: 400 });
    }

    await log("info", `봇 모임 삭제 시작: bots=${targetUids.length}`);

    const { error: deleteError, count: deletedInDb } = await supabaseAdmin
      .from("letsmeet_meetings")
      .delete({ count: "exact" })
      .in("host_id", targetUids);

    if (deleteError) {
      await log("error", `DB 삭제 실패: ${deleteError.message}`);
      return NextResponse.json({ error: `모임 삭제 실패: ${deleteError.message}` }, { status: 500 });
    }

    await log("warn", `봇 모임 삭제 완료: bots=${targetUids.length}, deletedInDb=${deletedInDb ?? 0}`);

    return NextResponse.json({
      ok: true,
      deletedInDb: deletedInDb ?? 0,
      bots: targetUids.length,
      config: null,
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    await log("error", `봇 모임 삭제 예외: ${apiError.error}`);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
