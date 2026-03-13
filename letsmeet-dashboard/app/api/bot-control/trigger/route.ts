import { NextRequest, NextResponse } from "next/server";
import { appendLog } from "@/lib/botStore";
import { POST as simulatePost } from "../simulate/route";

export const runtime = "nodejs";

/** UI/외부에서 "1회 시뮬레이션" 요청 시 즉시 simulate tick 1회 실행. */
export async function POST(request: NextRequest) {
  const expectedToken = process.env.DASHBOARD_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "Server misconfigured: DASHBOARD_TOKEN is not set" },
      { status: 500 }
    );
  }

  const providedToken = request.headers.get("x-dashboard-token")?.trim();
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { selectedBotUids?: unknown };
  const selectedBotUids = Array.isArray(body.selectedBotUids)
    ? body.selectedBotUids.filter(
        (v): v is string => typeof v === "string" && v.length > 0
      )
    : [];

  // simulate 라우트를 직접 호출하여 즉시 tick 1회 실행
  const internalReq = new NextRequest(new URL(request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-simulate-trigger": "runNow",
    },
    body: JSON.stringify({ selectedBotUids }),
  });

  await appendLog({
    level: "info",
    message: `1회 시뮬레이션 즉시 실행 (선택 봇 ${selectedBotUids.length}개)`,
  });

  const res = await simulatePost(internalReq);
  const resBody = await res.json();
  return NextResponse.json(resBody, { status: res.status });
}
