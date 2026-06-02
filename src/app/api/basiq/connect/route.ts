import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  basiqConfigured,
  basiqUserExists,
  consentUrl,
  createBasiqUser,
  getClientToken,
} from "@/lib/basiq/server";

/**
 * Ensures a Basiq user exists for the signed-in app user and returns the hosted
 * consent URL to link a bank. The app user → Basiq user mapping is stored in
 * public.basiq_connections (RLS-scoped to the user).
 */
export async function POST(request: NextRequest) {
  if (!basiqConfigured()) {
    return NextResponse.json(
      { error: "Basiq is not configured (missing BASIQ_API_KEY)." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      mobile?: string;
    };
    const mobile = body.mobile?.trim() || undefined;

    // Reuse an existing Basiq user only if it still exists under this app key.
    const { data: existing } = await supabase
      .from("basiq_connections")
      .select("basiq_user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let basiqUserId = existing?.basiq_user_id ?? null;
    if (basiqUserId && !(await basiqUserExists(basiqUserId))) {
      basiqUserId = null; // stale (e.g. created under a different app)
    }

    if (!basiqUserId) {
      basiqUserId = await createBasiqUser({ email: user.email!, mobile });
      const { error } = await supabase
        .from("basiq_connections")
        .upsert(
          { user_id: user.id, basiq_user_id: basiqUserId },
          { onConflict: "user_id" },
        );
      if (error) throw new Error(error.message);
    }

    const clientToken = await getClientToken(basiqUserId);
    return NextResponse.json({ consentUrl: consentUrl(clientToken) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Basiq connect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
