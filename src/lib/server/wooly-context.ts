import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getCurrentTeamContextForClient } from "@/lib/supabase/team-context";
import { canForTeam } from "@/lib/domain/permission-overrides";
import { permissionValues } from "@/lib/domain/wooly-permissions";
import type { WoolyAudience } from "@/lib/domain/wooly";
import { rateLimit } from "@/lib/rate-limit";

class WoolyAccessError extends Error {
  constructor(public readonly code: "session" | "support" | "rate-limit", message: string) { super(message); }
}

export async function woolyServerContext() {
  if (!hasSupabaseEnv()) return null;
  const client = await createClient();
  const context = await getCurrentTeamContextForClient(client);
  const audience: WoolyAudience = {
    userId: context.userId ?? "guest", teamId: context.teamId,
    role: context.role,
    hasTeam: Boolean(context.teamId), canManageMembers: context.canManageMembers,
    session: context.userId ? "account" : "guest",
    permissions: permissionValues.filter((permission) => canForTeam(context, permission)),
  };
  return { client, context, audience };
}

export async function requireWoolyAccount(scope: string, max = 30) {
  const session = await woolyServerContext();
  if (!session?.context.userId) throw new WoolyAccessError("session", "Sign in to use website support.");
  const limit = await rateLimit(`wooly:${scope}:${session.context.userId}`, max, 60_000);
  if (!limit.allowed) throw new WoolyAccessError("rate-limit", "Please wait a minute and try again.");
  return session;
}

export async function requireWoolySupport() {
  const session = await requireWoolyAccount("support", 60);
  const role = await session.client.rpc("is_wooly_support");
  if (role.error || role.data !== true) throw new WoolyAccessError("support", "Website support access is required.");
  return session;
}
