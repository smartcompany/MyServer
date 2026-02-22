import { NextRequest, NextResponse } from "next/server";
import {
  addMeeting,
  appendLog,
  getWeekKey,
  readBotState,
  toBotStateApiError,
  writeBotState,
} from "@/lib/botStore";
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
  const expectedToken = process.env.DASHBOARD_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "Server misconfigured: DASHBOARD_TOKEN is not set" },
      { status: 500 }
    );
  }

  const internalSimulator = request.headers.get("x-internal-simulator")?.trim();
  const isFromPm2Simulator = internalSimulator === expectedToken;
  const providedToken = request.headers.get("x-dashboard-token")?.trim();
  const simulateSource = request.headers.get("x-simulate-source");
  const isManualRun = simulateSource === "dashboard-manual";

  if (!isFromPm2Simulator) {
    if (!providedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 외부 호출(UI, GitHub Actions): runNow만 세팅 후 즉시 반환. 실제 tick은 instrumentation 폴링이 처리.
  if (!isFromPm2Simulator) {
    const state = await readBotState();
    if (!state.config.isRunning && !isManualRun) {
      await appendLog({
        level: "warn",
        message: "1회 시뮬레이션 스킵: isRunning=false. 'AI 봇 진행 시작'을 먼저 눌러주세요.",
      });
      return NextResponse.json({ ok: true, skipped: true, reason: "STOPPED" });
    }
    state.config.runNow = true;
    state.config.updatedAt = new Date().toISOString();
    await appendLog({
      level: "info",
      message:
        "1회 시뮬레이션 트리거됨 - 폴링이 tick을 실행할 때까지 기다려주세요 (최대 ~10초). 동작 안 하면 pm2 logs letsmeet-dashboard 확인.",
    });
    await writeBotState(state);
    return NextResponse.json({ ok: true, triggered: true });
  }

  // pm2 simulator 내부 호출: 실제 tick 실행
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = async (level: "info" | "warn" | "error", message: string) => {
    await appendLog({
      level,
      message: `[simulate:${requestId}] ${message}`,
    });
  };

  try {
    const initialState = await readBotState();
    const cfg = initialState.config;
    const isManualTrigger = cfg.runNow === true;
    let workingState = {
      ...initialState,
      botMeetings: [...initialState.botMeetings],
      weeklyCounters: { ...initialState.weeklyCounters },
    };
    const newBotMeetings: Array<{ id: string; hostUid: string; title: string; createdAt: string }> = [];
    const counterUpdates: Record<string, { weekKey: string; createdMeetings: number }> = {};

    await log(
      "info",
      `pm2 simulator tick 시작: runNow=${isManualTrigger}, isRunning=${cfg.isRunning}, selectedBots=${cfg.selectedBotUids.length}, creatorRatio=${cfg.creatorRatio}, weeklyLimit=${cfg.meetingsPerWeekPerBot}, applyN=${cfg.applicationsPerRunPerBot}`
    );

    const bots = cfg.selectedBotUids;
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
    const creatorCount = isManualTrigger
      ? shuffled.length
      : Math.max(1, Math.round(shuffled.length * cfg.creatorRatio));
    const creators = shuffled.slice(0, creatorCount);
    const appliers = shuffled;
    await log(
      "info",
      `역할 분리: creators=${creators.length}, appliers=${appliers.length}(전체 봇), manualTrigger=${isManualTrigger}`
    );

    const weekKey = getWeekKey();
    let createdNow = 0;
    let appliedNow = 0;
    let applyFailedNow = 0;
    let approvedNow = 0;
    let approveFailedNow = 0;
    let approveSkippedNow = 0;
    let skippedByWeeklyLimit = 0;
    let skippedSelfApply = 0;
    let createFailedNow = 0;

    for (const uid of creators) {
      const counter = workingState.weeklyCounters[uid];
      const current = counter?.weekKey === weekKey ? counter.createdMeetings : 0;
      if (current >= cfg.meetingsPerWeekPerBot) {
        skippedByWeeklyLimit += 1;
        await log("info", `${actor(uid)} 은(는) 주간 생성 제한으로 모임 생성을 건너뛰었습니다.`);
        continue;
      }

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

        const createdAt = new Date().toISOString();
        workingState = addMeeting(workingState, {
          id: body.meeting.id,
          hostUid: body.meeting.hostUid,
          title: body.meeting.title,
          createdAt,
        });
        const nextCounter = { weekKey, createdMeetings: current + 1 };
        workingState.weeklyCounters[uid] = nextCounter;
        counterUpdates[uid] = nextCounter;
        newBotMeetings.push({
          id: body.meeting.id,
          hostUid: body.meeting.hostUid,
          title: body.meeting.title,
          createdAt,
        });
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
      `모임 생성 단계 완료: created=${createdNow}, failed=${createFailedNow}, weeklyLimitSkipped=${skippedByWeeklyLimit}, botMeetingsTotal=${workingState.botMeetings.length}`
    );

    const baseMeetings = newBotMeetings.length > 0 ? newBotMeetings : workingState.botMeetings;
    const candidateMeetings = cfg.applyOnlyToBotMeetings ? baseMeetings : baseMeetings;
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

    const latestState = await readBotState();
    const mergedMeetingMap = new Map(latestState.botMeetings.map((meeting) => [meeting.id, meeting]));
    for (const meeting of newBotMeetings) {
      if (!mergedMeetingMap.has(meeting.id)) {
        mergedMeetingMap.set(meeting.id, meeting);
      }
    }

    let state = {
      ...latestState,
      botMeetings: Array.from(mergedMeetingMap.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 1000),
      weeklyCounters: {
        ...latestState.weeklyCounters,
        ...counterUpdates,
      },
    };

    await appendLog({
      level: "info",
      message: `[simulate:${requestId}] tick 완료: creators=${creators.length}, created=${createdNow}, appliers=${appliers.length}, applied=${appliedNow}, approved=${approvedNow}`,
    });
    state.config.runNow = false;
    state.config.lastTickAt = new Date().toISOString();
    state.config.updatedAt = new Date().toISOString();
    await writeBotState(state);

    return NextResponse.json({
      ok: true,
      summary: {
        selectedBots: bots.length,
        creators: creators.length,
        createdNow,
        createFailedNow,
        skippedByWeeklyLimit,
        appliers: appliers.length,
        appliedNow,
        applyFailedNow,
        skippedSelfApply,
        approvedNow,
        approveFailedNow,
        approveSkippedNow,
        botMeetingsTotal: state.botMeetings.length,
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
