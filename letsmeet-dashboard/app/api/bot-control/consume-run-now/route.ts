import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 현재는 자동 tick 을 사용하지 않으므로, 항상 consumed: false 를 반환하는 더미 엔드포인트.
export async function POST() {
  return NextResponse.json({ consumed: false });
}
