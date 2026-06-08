// POST /api/reset — wipe ALL tournament data (full reset).
//
// SERVER-ONLY route. Deleting rows requires the privileged service-role key,
// which is NEVER exposed to the browser (the public anon key is granted only
// select/insert/update by RLS — see CLAUDE.md §3). So a purge cannot happen
// from the client/anon key; it must come through this route.
//
// Two server-only secrets gate this (neither is NEXT_PUBLIC_, so neither ships
// in the bundle):
//   - ADMIN_RESET_TOKEN        a passphrase the caller must supply in the body.
//                              It is compared server-side and is NOT in client
//                              code — only the family admin knows it.
//   - SUPABASE_SERVICE_ROLE_KEY  the privileged key used to perform the deletes.
//
// The Admin "Reset tournament" control (hidden tab) collects the passphrase and
// POSTs it here. On success every row in every table is removed.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Delete order respects foreign keys: rows that reference activities/players
// (games, adjustments, commentary) go first, then the referenced tables. Each
// pair is [table, a non-null primary-key column] — `.not(pk, "is", null)` is a
// match-all filter (PostgREST requires a WHERE clause on delete).
const WIPE_ORDER: ReadonlyArray<readonly [string, string]> = [
  ["games", "id"],
  ["adjustments", "id"],
  ["commentary", "activity_id"],
  ["tournament_commentary", "id"],
  ["players", "id"],
  ["activities", "id"],
];

export async function POST(req: Request) {
  const expected = process.env.ADMIN_RESET_TOKEN;
  if (!expected) {
    return Response.json(
      { error: "Reset is not configured (missing ADMIN_RESET_TOKEN)." },
      { status: 503 },
    );
  }

  let token = "";
  try {
    const body = await req.json();
    if (body && typeof body.token === "string") token = body.token;
  } catch {
    // fall through — empty token fails the check below
  }
  if (!token || token !== expected) {
    return Response.json(
      { error: "Incorrect reset passphrase." },
      { status: 401 },
    );
  }

  const sb = serviceClient();
  if (!sb) {
    return Response.json(
      { error: "Server is not configured for reset (missing service-role key)." },
      { status: 500 },
    );
  }

  const deleted: Record<string, number> = {};
  for (const [table, pk] of WIPE_ORDER) {
    const { data, error } = await sb
      .from(table)
      .delete()
      .not(pk, "is", null)
      .select(pk);
    if (error) {
      return Response.json(
        { error: `Failed wiping ${table}: ${error.message}`, deleted },
        { status: 500 },
      );
    }
    deleted[table] = data?.length ?? 0;
  }

  return Response.json({ ok: true, deleted });
}
