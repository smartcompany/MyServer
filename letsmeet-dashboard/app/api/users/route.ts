import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DashboardUser } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { auth } = getFirebaseAdmin();
    const firebaseUsers = await auth.listUsers(1000);

    const uids = firebaseUsers.users.map((u) => u.uid);
    const userMap = new Map<
      string,
      { full_name: string | null; trust_score: number | null; is_active: boolean | null }
    >();

    if (uids.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("letsmeet_users")
        .select("user_id, full_name, trust_score, is_active")
        .in("user_id", uids);

      if (error) {
        return NextResponse.json(
          { error: `Supabase query failed: ${error.message}` },
          { status: 500 }
        );
      }

      for (const row of data ?? []) {
        userMap.set(row.user_id as string, {
          full_name: (row.full_name as string | null) ?? null,
          trust_score: (row.trust_score as number | null) ?? null,
          is_active: (row.is_active as boolean | null) ?? null,
        });
      }
    }

    const users: DashboardUser[] = firebaseUsers.users.map((u) => {
      const profile = userMap.get(u.uid);
      return {
        uid: u.uid,
        email: u.email ?? null,
        firebaseDisplayName: u.displayName ?? null,
        profileName: profile?.full_name ?? null,
        trustScore: profile?.trust_score ?? null,
        isActive: profile?.is_active ?? null,
      };
    });

    users.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
