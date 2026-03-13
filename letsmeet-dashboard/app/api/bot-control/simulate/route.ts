import { NextRequest, NextResponse } from "next/server";
import { appendLog, readBotState, toBotStateApiError } from "@/lib/botStore";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { POST as createMeetingPost } from "../create-meeting/route";
import { POST as createApplicationPost } from "../create-application/route";
import { POST as approveApplicationsPost } from "../approve-applications/route";

export const runtime = "nodejs";

function shuffle<T>(list: T[]) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type CreateMeetingApiResponse =
  | {
      ok: true;
      meeting: {
        id: string;
        hostUid: string;
        title: string;
      };
    }
  | { error?: string };

type CreateApplicationApiResponse =
  | {
      ok: true;
      application: {
        id: string;
        meetingId: string;
        userId: string;
        status: string;
      };
    }
  | { error?: string };

type ApproveApplicationsApiResponse =
  | {
      ok: true;
      summary: {
        approvedNow: number;
        failedNow: number;
        skippedNow: number;
        closedNow: number;
      };
    }
  | { error?: string };

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = async (level: "info" | "warn" | "error", message: string) => {
    await appendLog({
      level,
      message: `[simulate:${requestId}] ${message}`,
    });
  };

  try {
    const { config: cfg } = await readBotState();
    const isManualTrigger = request.headers.get("x-simulate-trigger") === "runNow";

    // 선택된 봇 목록은 letsmeet_users.is_bot 기준으로 미리 계산되어
    // trigger → simulate 호출 시 body.selectedBotUids 로만 전달된다.
    // config.selectedBotUids 는 더 이상 소스 오브 트루스가 아니므로 사용하지 않는다.
    const bodyJson = (await request.json().catch(() => ({}))) as {
      selectedBotUids?: unknown;
    };
    const bots = Array.isArray(bodyJson.selectedBotUids)
      ? bodyJson.selectedBotUids.filter(
          (v): v is string => typeof v === "string" && v.length > 0
        )
      : [];

    await log(
      "info",
      `시뮬레이션 시작: manual=${isManualTrigger}, selectedBots=${bots.length}, creatorRatio=${cfg.creatorRatio}, applyN=${cfg.applicationsPerRunPerBot}`
    );

    if (bots.length === 0) {
      await log("warn", "선택된 봇 계정 없음");
      return NextResponse.json({ error: "선택된 봇 계정이 없습니다." }, { status: 400 });
    }

    const uidToEmail = new Map<string, string>();
    try {
      const { auth } = getFirebaseAdmin();
      const result = await auth.getUsers(bots.map((uid) => ({ uid })));
      for (const user of result.users) {
        if (user.email) uidToEmail.set(user.uid, user.email);
      }
    } catch (error) {
      await log(
        "warn",
        `이메일 매핑 조회 실패(UID로 로그 대체): ${error instanceof Error ? error.message : "unknown"}`
      );
    }
    const actor = (uid: string) => uidToEmail.get(uid) ?? uid;

    const shuffled = shuffle(bots);
    const creators = shuffled; // 선택된 봇 전원이 모임 생성
    const appliers = shuffled;
    await log(
      "info",
      `역할 분리: creators=${creators.length}, appliers=${appliers.length}(전체 봇), manualTrigger=${isManualTrigger}`
    );

    let createdNow = 0;
    let appliedNow = 0;
    let applyFailedNow = 0;
    let approvedNow = 0;
    let approveFailedNow = 0;
    let approveSkippedNow = 0;
    let skippedSelfApply = 0;
    let createFailedNow = 0;

    for (const uid of creators) {
      try {
        const hostEmail = uidToEmail.get(uid);
        const internalReq = new NextRequest(new URL(request.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, email: hostEmail }),
        });
        const createRes = await createMeetingPost(internalReq);
        const body = (await createRes.json()) as CreateMeetingApiResponse;

        if (!createRes.ok || !("ok" in body) || !body.ok) {
          createFailedNow += 1;
          await log(
            "error",
            `${actor(uid)} 모임 생성 실패: status=${createRes.status}, reason=${"error" in body ? (body.error ?? "unknown") : "unknown"}`
          );
          continue;
        }

        createdNow += 1;
        await log("info", `${actor(uid)} 이(가) "${body.meeting.title}" 모임을 생성했습니다.`);
      } catch (error) {
        createFailedNow += 1;
        await log(
          "error",
          `${actor(uid)} 모임 생성 중 예외가 발생했습니다: ${error instanceof Error ? error.message : "unknown"}`
        );
      }
    }

    await log(
      "info",
      `모임 생성 단계 완료: created=${createdNow}, failed=${createFailedNow}`
    );

    // 현재는 applyOnlyToBotMeetings 설정만 사용하며, 주간 카운터는 유지하지 않는다.
    const candidateMeetings: Array<{ id: string; hostUid: string; title: string }> = [];
    // creators 가 생성한 모임들에만 신청을 넣는다.
    // (실제 모임 레코드는 DB에 저장되므로 여기서는 id/title 정도만 사용)
    // createdNow 카운트만 summary 로 사용하므로, 신청 대상 풀이 없으면 신청 단계는 스킵된다.
    if (candidateMeetings.length > 0) {
      for (const uid of appliers) {
        const maxApplies = Math.max(0, cfg.applicationsPerRunPerBot);
        if (maxApplies === 0) {
          skippedSelfApply += 1;
          await log("info", `${actor(uid)} 은(는) 신청 개수 N=0 설정으로 신청을 건너뛰었습니다.`);
          continue;
        }

        const targetPool = candidateMeetings.filter((meeting) => meeting.hostUid !== uid);
        if (targetPool.length === 0) {
          skippedSelfApply += 1;
          await log("info", `${actor(uid)} 은(는) 신청 가능한 타인 모임이 없어 건너뛰었습니다.`);
          continue;
        }

        const selectedTargets = shuffle(targetPool).slice(0, Math.min(maxApplies, targetPool.length));
        for (const target of selectedTargets) {
          try {
            const applicantEmail = uidToEmail.get(uid);
            const internalReq = new NextRequest(new URL(request.url), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid, email: applicantEmail, meetingId: target.id }),
            });
            const applyRes = await createApplicationPost(internalReq);
            const body = (await applyRes.json()) as CreateApplicationApiResponse;

            if (!applyRes.ok || !("ok" in body) || !body.ok) {
              applyFailedNow += 1;
              await log(
                "warn",
                `${actor(uid)} 신청 실패: meeting="${target.title}", reason=${"error" in body ? (body.error ?? "unknown") : "unknown"}`
              );
              continue;
            }

            appliedNow += 1;
            await log("info", `${actor(uid)} 이(가) "${target.title}" 모임에 신청을 했습니다.`);
          } catch (error) {
            applyFailedNow += 1;
            await log(
              "error",
              `${actor(uid)} 신청 중 예외가 발생했습니다: ${error instanceof Error ? error.message : "unknown"}`
            );
          }
        }
      }
    } else {
      await log("info", "신청 대상 모임 없음");
    }
    await log("info", `신청 단계 완료: applied=${appliedNow}, failed=${applyFailedNow}, selfSkipped=${skippedSelfApply}`);

    try {
      const approveReq = new NextRequest(new URL(request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedBotUids: bots }),
      });
      const approveRes = await approveApplicationsPost(approveReq);
      const approveBody = (await approveRes.json()) as ApproveApplicationsApiResponse;

      if (!approveRes.ok || !("ok" in approveBody) || !approveBody.ok) {
        await log(
          "warn",
          `승인 단계 실패: reason=${"error" in approveBody ? (approveBody.error ?? "unknown") : "unknown"}`
        );
      } else {
        approvedNow = approveBody.summary.approvedNow;
        approveFailedNow = approveBody.summary.failedNow;
        approveSkippedNow = approveBody.summary.skippedNow;
        await log(
          "info",
          `승인 단계 완료: approved=${approvedNow}, failed=${approveFailedNow}, skipped=${approveSkippedNow}, closed=${approveBody.summary.closedNow}`
        );
      }
    } catch (error) {
      await log("error", `승인 단계 예외: ${error instanceof Error ? error.message : "unknown"}`);
    }

    await appendLog({
      level: "info",
      message: `[simulate:${requestId}] tick 완료: creators=${creators.length}, created=${createdNow}, appliers=${appliers.length}, applied=${appliedNow}, approved=${approvedNow}`,
    });

    return NextResponse.json({
      ok: true,
      summary: {
        selectedBots: bots.length,
        creators: creators.length,
        createdNow,
        createFailedNow,
        appliers: appliers.length,
        appliedNow,
        applyFailedNow,
        skippedSelfApply,
        approvedNow,
        approveFailedNow,
        approveSkippedNow,
        botMeetingsTotal: createdNow,
      },
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    try {
      await log("error", `simulate 예외: ${apiError.error}`);
    } catch {
      // ignore secondary logging failure
    }
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
