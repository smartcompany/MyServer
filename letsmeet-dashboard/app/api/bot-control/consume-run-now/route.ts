import { NextResponse } from "next/server";
import { consumeRunNow, toBotStateApiError } from "@/lib/botStore";

export const runtime = "nodejs";

/** 시뮬레이터 폴링용. runNow가 true이면 false로 소비 후 { consumed: true } 반환 */
export async function POST(request: Request) {
  const expectedToken = process.env.DASHBOARD_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: "DASHBOARD_TOKEN not set" }, { status: 500 });
  }
  const token = request.headers.get("x-internal-simulator")?.trim();
  if (token !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const consumed = await consumeRunNow();
    return NextResponse.json({ consumed });
  } catch (error) {
    const apiError = toBotStateApiError(error);
    return NextResponse.json({ error: apiError.error }, { status: apiError.status });
  }
}
