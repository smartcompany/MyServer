import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * PATCH /api/users/[uid]/bot — letsmeet_users.is_bot 즉시 업데이트
 * body: { isBot: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid } = await params;
    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as { isBot?: boolean };
    const isBot = typeof body.isBot === "boolean" ? body.isBot : undefined;
    if (isBot === undefined) {
      return NextResponse.json({ error: "isBot (boolean) required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("letsmeet_users")
      .update({ is_bot: isBot })
      .eq("user_id", uid);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update is_bot: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, isBot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
