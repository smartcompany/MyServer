import { NextRequest, NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError } from "@/lib/botStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type MeetingRow = {
  id: string;
  host_id: string;
  title: string;
  max_participants: number;
  status: string;
};

type PendingAppRow = {
  id: string;
  meeting_id: string;
  user_id: string;
  applied_at: string | null;
};

export async function POST(request: NextRequest) {
  let state: Awaited<ReturnType<typeof readBotState>> | null = null;
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = async (level: "info" | "warn" | "error", message: string) => {
    await appendLog({
      level,
      message: `[approve-applications:${requestId}] ${message}`,
    });
  };

  try {
    state = await readBotState();
    const body = (await request.json().catch(() => ({}))) as { selectedBotUids?: string[] };
    const selectedBotUids = Array.isArray(body.selectedBotUids)
      ? body.selectedBotUids.filter((uid): uid is string => typeof uid === "string" && uid.length > 0)
      : [];

    if (selectedBotUids.length === 0) {
      await log("warn", "승인 처리 건너뜀: 선택된 봇 계정 없음");
      return NextResponse.json({ ok: true, summary: { approvedNow: 0, failedNow: 0, skippedNow: 0, closedNow: 0 } });
    }

    await log("info", `승인 처리 시작: selectedBots=${selectedBotUids.length}`);

    const { data: meetings, error: meetingsError } = await supabaseAdmin
      .from("letsmeet_meetings")
      .select("id, host_id, title, max_participants, status")
      .in("host_id", selectedBotUids);

    if (meetingsError) {
      await log("error", `승인 처리 실패: 모임 조회 오류 (${meetingsError.message})`);
      return NextResponse.json({ error: meetingsError.message }, { status: 500 });
    }

    const hostMeetings = (meetings ?? []) as MeetingRow[];
    if (hostMeetings.length === 0) {
      await log("info", "승인 처리 완료: 대상 모임 없음");
      return NextResponse.json({ ok: true, summary: { approvedNow: 0, failedNow: 0, skippedNow: 0, closedNow: 0 } });
    }

    const meetingIds = hostMeetings.map((m) => m.id);
    const meetingMap = new Map(hostMeetings.map((m) => [m.id, m]));

    const { data: pendingApps, error: pendingError } = await supabaseAdmin
      .from("letsmeet_applications")
      .select("id, meeting_id, user_id, applied_at")
      .eq("status", "pending")
      .in("meeting_id", meetingIds)
      .in("user_id", selectedBotUids)
      .order("applied_at", { ascending: true });

    if (pendingError) {
      await log("error", `승인 처리 실패: pending 신청 조회 오류 (${pendingError.message})`);
      return NextResponse.json({ error: pendingError.message }, { status: 500 });
    }

    const { data: approvedRows, error: approvedError } = await supabaseAdmin
      .from("letsmeet_applications")
      .select("meeting_id")
      .eq("status", "approved")
      .in("meeting_id", meetingIds);

    if (approvedError) {
      await log("error", `승인 처리 실패: approved 카운트 조회 오류 (${approvedError.message})`);
      return NextResponse.json({ error: approvedError.message }, { status: 500 });
    }

    const approvedCountByMeeting = new Map<string, number>();
    for (const row of approvedRows ?? []) {
      const meetingId = row.meeting_id as string;
      approvedCountByMeeting.set(meetingId, (approvedCountByMeeting.get(meetingId) ?? 0) + 1);
    }

    let approvedNow = 0;
    let failedNow = 0;
    let skippedNow = 0;

    for (const app of (pendingApps ?? []) as PendingAppRow[]) {
      const meeting = meetingMap.get(app.meeting_id);
      if (!meeting) {
        skippedNow += 1;
        continue;
      }

      if (meeting.status !== "open") {
        skippedNow += 1;
        continue;
      }

      const approvedCount = approvedCountByMeeting.get(meeting.id) ?? 0;
      if (approvedCount >= meeting.max_participants) {
        skippedNow += 1;
        continue;
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("letsmeet_applications")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", app.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (updateError || !updated) {
        failedNow += 1;
        continue;
      }

      approvedNow += 1;
      approvedCountByMeeting.set(meeting.id, approvedCount + 1);
    }

    let closedNow = 0;
    for (const meeting of hostMeetings) {
      const approvedCount = approvedCountByMeeting.get(meeting.id) ?? 0;
      if (meeting.status === "open" && approvedCount >= meeting.max_participants) {
        const { error: closeError } = await supabaseAdmin
          .from("letsmeet_meetings")
          .update({ status: "closed" })
          .eq("id", meeting.id);
        if (!closeError) {
          closedNow += 1;
        }
      }
    }

    await log(
      "info",
      `승인 처리 완료: approved=${approvedNow}, failed=${failedNow}, skipped=${skippedNow}, closed=${closedNow}`
    );

    return NextResponse.json({
      ok: true,
      summary: {
        approvedNow,
        failedNow,
        skippedNow,
        closedNow,
      },
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    await log("error", `승인 처리 예외: ${apiError.error}`);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
