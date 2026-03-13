import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 과거 자동 진행용 API. 지금은 사용하지 않으므로 no-op 으로 유지.
export async function POST() {
  return NextResponse.json({ ok: false, disabled: true });
}
