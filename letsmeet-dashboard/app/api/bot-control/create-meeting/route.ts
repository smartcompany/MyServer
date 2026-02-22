import { NextRequest, NextResponse } from "next/server";
import {
  addMeeting,
  appendLog,
  readBotState,
  toBotStateApiError,
  writeBotState,
} from "@/lib/botStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import meetingImagePoolJson from "@/data/meeting-image-pool.json";
import promptTemplateSource from "./prompt.txt";
import OpenAI from "openai";

export const runtime = "nodejs";

const LOCATIONS = ["강서구", "마포구", "서초구", "송파구", "영등포구", "성수동"];
const MEETING_CATEGORY_GROUPS = [
  {
    main: "운동/액티비티",
    sub: ["전체", "러닝", "헬스", "등산", "클라이밍", "요가", "축구", "배드민턴"],
  },
  {
    main: "댄스/취미 클래스",
    sub: ["전체", "살사", "바차타", "힙합", "K-pop댄스", "탱고"],
  },
  {
    main: "여행/나들이",
    sub: ["전체", "국내여행", "근교 드라이브", "당일치기", "맛집투어"],
  },
  {
    main: "맛집/카페",
    sub: ["전체", "식사모임", "브런치", "술 한잔", "디저트"],
  },
  {
    main: "자기계발/스터디",
    sub: ["전체", "독서", "외국어", "재테크", "코딩", "글쓰기"],
  },
  {
    main: "문화/예술",
    sub: ["전체", "전시회", "공연", "영화", "사진", "그림"],
  },
  {
    main: "게임/엔터테인먼트",
    sub: ["전체", "보드게임", "콘솔게임", "온라인게임", "방탈출"],
  },
  {
    main: "소셜/친목",
    sub: ["전체", "신규친구", "수다", "동네모임"],
  },
  {
    main: "힐링/라이프스타일",
    sub: ["전체", "산책", "명상", "요가", "마인드풀니스"],
  },
  {
    main: "기타",
    sub: ["전체"],
  },
] as const;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
let promptTemplateCache: string | null = null;
const OPENAI_MAX_COMPLETION_TOKENS = 2000;

function pick<T>(arr: readonly T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeFutureDate() {
  const now = new Date();
  const dayOffset = 1 + Math.floor(Math.random() * 10); // 1~10일 후
  const hour = 19 + Math.floor(Math.random() * 3); // 19~21시
  const minute = Math.random() < 0.5 ? 0 : 30;
  const dt = new Date(now);
  dt.setDate(now.getDate() + dayOffset);
  dt.setHours(hour, minute, 0, 0);
  return dt.toISOString();
}

type GeneratedMeetingCopy = {
  title: string;
  description: string;
  locationDetail: string;
};

type MeetingImagePool = {
  defaults?: string[];
  byMainCategory?: Record<string, string[]>;
  bySubCategory?: Record<string, string[]>;
};
const meetingImagePool = meetingImagePoolJson as MeetingImagePool;

async function loadPromptTemplate() {
  if (promptTemplateCache) return promptTemplateCache;
  promptTemplateCache = promptTemplateSource;
  return promptTemplateCache;
}

async function pickMeetingImageUrl(mainCategory: string, subCategory: string) {
  const pool = meetingImagePool;
  const fromSub = pool.bySubCategory?.[subCategory] ?? [];
  if (fromSub.length > 0) return pick(fromSub);

  const fromMain = pool.byMainCategory?.[mainCategory] ?? [];
  if (fromMain.length > 0) return pick(fromMain);

  const fromDefaults = pool.defaults ?? [];
  if (fromDefaults.length > 0) return pick(fromDefaults);

  return null;
}

async function generateMeetingCopyWithAI(params: {
  hostName: string;
  location: string;
  mainCategory: string;
  subCategory: string;
}): Promise<GeneratedMeetingCopy | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const template = await loadPromptTemplate();
  const prompt = template
    .replaceAll("{{HOST_NAME}}", params.hostName)
    .replaceAll("{{LOCATION}}", params.location)
    .replaceAll("{{MAIN_CATEGORY}}", params.mainCategory)
    .replaceAll("{{SUB_CATEGORY}}", params.subCategory);

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: OPENAI_MAX_COMPLETION_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) return null;

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;

  const jsonPart = content.slice(start, end + 1);
  const parsed = JSON.parse(jsonPart) as Partial<GeneratedMeetingCopy>;

  const title = parsed.title?.trim();
  const description = parsed.description?.trim();
  const locationDetail = parsed.locationDetail?.trim();
  if (!title || !description || !locationDetail) return null;

  return {
    title: title.slice(0, 40),
    description: description.slice(0, 500),
    locationDetail: locationDetail.slice(0, 60),
  };
}

export async function POST(request: NextRequest) {
  let state: Awaited<ReturnType<typeof readBotState>> | null = null;
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = async (level: "info" | "warn" | "error", message: string) => {
    try {
      await appendLog({
        level,
        message: `[create-meeting:${requestId}] ${message}`,
      });
    } catch (e) {
      console.error("[create-meeting] failed to write bot log:", e);
    }
  };

  try {
    state = await readBotState();
    await log("info", "요청 시작");
    const body = (await request.json()) as { uid?: string; email?: string };
    const uid = body.uid?.trim();
    if (!uid) {
      await log("error", "수동 모임 생성 실패: uid 누락");
      return NextResponse.json({ error: "uid is required" }, { status: 400 });
    }

    const hostForLog = body.email?.trim() || uid;

    await log("info", `수동 모임 생성 요청: host=${hostForLog}`);

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("letsmeet_users")
      .select("user_id, full_name")
      .eq("user_id", uid)
      .single();

    if (userError || !userRow) {
      await log("error", `수동 모임 생성 실패: letsmeet_users에서 host=${hostForLog} 조회 실패`);
      return NextResponse.json(
        { error: `봇 사용자 프로필을 찾을 수 없습니다: ${hostForLog}` },
        { status: 404 }
      );
    }
    await log("info", `호스트 프로필 조회 완료: host=${hostForLog}`);

    const selectedCategoryGroup = pick([...MEETING_CATEGORY_GROUPS]);
    const subCandidates = selectedCategoryGroup.sub.filter((item) => item !== "전체");
    const subCategory = pick(subCandidates.length > 0 ? subCandidates : selectedCategoryGroup.sub);
    const mainCategory = selectedCategoryGroup.main;
    const location = pick(LOCATIONS);
    const meetingDate = makeFutureDate();
    const hostName = (userRow.full_name as string) || "봇 사용자";
    const pickedImageUrl = await pickMeetingImageUrl(mainCategory, subCategory);

    await log("info", `AI 문구 생성 시작: host=${hostForLog}`);
    let generated: GeneratedMeetingCopy;
    try {
      const result = await generateMeetingCopyWithAI({
        hostName,
        location,
        mainCategory,
        subCategory,
      });
      if (!result) {
        const reason = "empty_or_invalid_response";
        await log("error", `AI 문구 생성 에러: host=${hostForLog}, reason=${reason}`);
        return NextResponse.json({ error: `AI 문구 생성 실패(${reason})` }, { status: 502 });
      } else {
        await log("info", `AI 문구 생성 완료: host=${hostForLog}`);
      }
      generated = result;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown";
      await log(
        "error",
        `AI 문구 생성 에러: host=${hostForLog}, reason=${reason}`
      );
      return NextResponse.json({ error: `AI 문구 생성 실패(${reason})` }, { status: 502 });
    }

    const title = generated.title;
    const description = generated.description;
    const locationDetail = generated.locationDetail;
    await log("info", `DB insert 시작: host=${hostForLog}`);

    const { data: meeting, error: insertError } = await supabaseAdmin
      .from("letsmeet_meetings")
      .insert({
        host_id: uid,
        title,
        description,
        meeting_date: meetingDate,
        location,
        location_detail: locationDetail,
        max_participants: 6,
        interests: [subCategory],
        category: mainCategory,
        participation_fee: 0,
        gender_restriction: "all",
        age_range_min: null,
        age_range_max: null,
        approval_type: "approval_required",
        status: "open",
        image_urls: pickedImageUrl ? [pickedImageUrl] : [],
        application_questions: [],
      })
      .select("id, host_id, title, created_at")
      .single();
    await log("info", `DB insert 응답: host=${hostForLog}, hasError=${Boolean(insertError)}`);

    if (insertError || !meeting) {
      await log(
        "error",
        `수동 모임 생성 실패: host=${hostForLog}, reason=${insertError?.message ?? "unknown"}`
      );
      return NextResponse.json(
        { error: `모임 생성 실패: ${insertError?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    state = addMeeting(state, {
      id: meeting.id as string,
      hostUid: meeting.host_id as string,
      title: meeting.title as string,
      createdAt: (meeting.created_at as string) ?? new Date().toISOString(),
    });
    await writeBotState(state);
    await log("info", `수동 모임 생성: host=${hostForLog}, meeting=${meeting.id}, title="${meeting.title}"`);

    return NextResponse.json({
      ok: true,
      meeting: {
        id: meeting.id,
        hostUid: meeting.host_id,
        title: meeting.title,
      },
    });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    await log("error", `수동 모임 생성 예외: ${apiError.error}`);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
