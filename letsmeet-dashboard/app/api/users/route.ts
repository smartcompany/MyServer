import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DashboardUser } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { auth } = getFirebaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("letsmeet_users")
      .select("user_id, full_name, trust_score, is_active, is_bot");

    if (error) {
      return NextResponse.json(
        { error: `Supabase query failed: ${error.message}` },
        { status: 500 }
      );
    }

    const profileRows = data ?? [];

    // letsmeet_users 테이블을 기준으로 사용자 목록을 만들고,
    // Firebase 쪽에는 있는 경우에만 이메일/표시 이름을 붙인다.
    const firebaseUsers = await auth.listUsers(1000);
    const firebaseMap = new Map<
      string,
      { email: string | null; displayName: string | null; provider: string | null }
    >();
    for (const u of firebaseUsers.users) {
      const provider = u.providerData[0]?.providerId ?? null;
      firebaseMap.set(u.uid, {
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        provider,
      });
    }

    const users: DashboardUser[] = profileRows.map((row) => {
      const uid = row.user_id as string;
      const firebase = firebaseMap.get(uid);
      return {
        uid,
        email: firebase?.email ?? null,
        loginProvider: firebase?.provider ?? null,
        firebaseDisplayName: firebase?.displayName ?? null,
        profileName: (row.full_name as string | null) ?? null,
        trustScore: (row.trust_score as number | null) ?? null,
        isActive: (row.is_active as boolean | null) ?? null,
        isBot: (row.is_bot as boolean | null) ?? false,
      };
    });

    users.sort((a, b) => {
      const aKey = (a.profileName || a.email || a.uid || "").toLowerCase();
      const bKey = (b.profileName || b.email || b.uid || "").toLowerCase();
      return aKey.localeCompare(bKey);
    });

    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
