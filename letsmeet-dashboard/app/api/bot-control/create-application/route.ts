import { NextRequest, NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError, writeBotState } from "@/lib/botStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let state: Awaited<ReturnType<typeof readBotState>> | null = null;
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = async (level: "info" | "warn" | "error", message: string) => {
    if (!state) return;
    state = appendLog(state, {
      level,
      message: `[create-application:${requestId}] ${message}`,
    });
    await writeBotState(state);
  };

  try {
    state = await readBotState();
    const body = (await request.json()) as { uid?: string; email?: string; meetingId?: string };
    const uid = body.uid?.trim();
    const meetingId = body.meetingId?.trim();
    const actor = body.email?.trim() || uid || "unknown";

    if (!uid || !meetingId) {
      await log("error", `신청 생성 실패: uid/meetingId 누락 (actor=${actor})`);
      return NextResponse.json({ error: "uid and meetingId are required" }, { status: 400 });
    }

    await log("info", `신청 생성 요청: actor=${actor}, meetingId=${meetingId}`);

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from("letsmeet_meetings")
      .select("id, host_id, title, status, max_participants, approval_type")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      await log("error", `신청 생성 실패: 모임 없음 (actor=${actor}, meetingId=${meetingId})`);
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if ((meeting.host_id as string) === uid) {
      await log("warn", `신청 건너뜀: 자신의 모임 (actor=${actor}, meetingId=${meetingId})`);
      return NextResponse.json({ error: "Cannot apply to own meeting" }, { status: 400 });
    }

    if ((meeting.status as string) !== "open") {
      await log("warn", `신청 실패: 모임 상태가 open 아님 (actor=${actor}, meetingId=${meetingId})`);
      return NextResponse.json({ error: "Meeting is not open for applications" }, { status: 400 });
    }

    const { data: existingApplication } = await supabaseAdmin
      .from("letsmeet_applications")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("user_id", uid)
      .maybeSingle();

    if (existingApplication) {
      await log("warn", `신청 건너뜀: 이미 신청함 (actor=${actor}, meetingId=${meetingId})`);
      return NextResponse.json({ error: "Already applied to this meeting" }, { status: 400 });
    }

    const { count: approvedCount } = await supabaseAdmin
      .from("letsmeet_applications")
      .select("*", { count: "exact", head: true })
      .eq("meeting_id", meetingId)
      .eq("status", "approved");

    if ((approvedCount || 0) >= ((meeting.max_participants as number) || 0)) {
      await log("warn", `신청 실패: 정원 초과 (actor=${actor}, meetingId=${meetingId})`);
      return NextResponse.json({ error: "Meeting is full" }, { status: 400 });
    }

    const { data: userData } = await supabaseAdmin
      .from("letsmeet_users")
      .select("trust_score")
      .eq("user_id", uid)
      .single();

    if (!userData || (userData.trust_score as number | null) == null || (userData.trust_score as number) < 10) {
      await log("warn", `신청 실패: 신뢰점수 부족 (actor=${actor}, meetingId=${meetingId})`);
      return NextResponse.json({ error: "Insufficient trust score to apply" }, { status: 403 });
    }

    const initialStatus =
      (meeting.approval_type as string) === "immediate" ? "approved" : "pending";

    const { data: application, error: insertError } = await supabaseAdmin
      .from("letsmeet_applications")
      .insert({
        meeting_id: meetingId,
        user_id: uid,
        status: initialStatus,
      })
      .select("id, meeting_id, user_id, status")
      .single();

    if (insertError || !application) {
      await log(
        "error",
        `신청 생성 실패: DB insert 오류 (actor=${actor}, meetingId=${meetingId}, reason=${insertError?.message ?? "unknown"})`
      );
      return NextResponse.json(
        { error: `Failed to apply to meeting: ${insertError?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    await log(
      "info",
      `신청 생성 완료: actor=${actor}, meeting="${meeting.title as string}", status=${application.status as string}`
    );

    return NextResponse.json({
      ok: true,
      application: {
        id: application.id,
        meetingId: application.meeting_id,
        userId: application.user_id,
        status: application.status,
      },
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    await log("error", `신청 생성 예외: ${apiError.error}`);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
