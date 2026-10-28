import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/rate-limit";
import { MobileApiError } from "../context";
import { mobileRoute } from "../http";
import { readSelectedWorkspace } from "./workspaces";

export async function requireMobileUser(request: Request) {
  if (!hasSupabaseEnv()) throw new MobileApiError(503, "unavailable", "Account services are unavailable.");
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) {
    throw new MobileApiError(401, "session", "Sign in to sync this device.");
  }
  const { url, publishableKey } = getSupabaseEnv();
  const client = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await client.auth.getUser(authorization.slice('Bearer '.length));
  if (error) throw new MobileApiError(error.status === 401 || error.status === 403 ? 401 : 503, 'session', 'Account verification could not be completed. Retry when connected.');
  if (!user || !z.uuid().safeParse(user.id).success) {
    throw new MobileApiError(401, "session", "Sign in to sync this device.");
  }
  if (request.headers.get("x-mobile-user-id") !== user.id) {
    throw new MobileApiError(409, "scope_changed", "Reopen the matching account to sync this device.");
  }
  const limit = await rateLimit(`mobile:v2:${user.id}`, 90, 60_000);
  if (!limit.allowed) throw new MobileApiError(429, "rate_limit", "Wait a minute before syncing again.");
  return { client, userId: user.id };
}
export type MobileUserContext = Awaited<ReturnType<typeof requireMobileUser>>;

export async function requireSelectedWorkspace(request: Request, teamId: string) {
  const selectedTeamId = z.uuid().parse(teamId);
  const context = await requireMobileUser(request);
  if (request.headers.get("x-mobile-team-id") !== selectedTeamId) {
    throw new MobileApiError(409, "scope_changed", "Reopen the matching workspace to sync these drafts.");
  }
  const workspace = await readSelectedWorkspace({ ...context, teamId: selectedTeamId });
  return { client: context.client, identity: { userId: context.userId, ...workspace } };
}

const mobileErrorSchema = z.object({ version: z.literal(1), error: z.object({ code: z.string(), message: z.string() }) });
// Retain the existing origin/error/cache boundary without changing v1 wire semantics.
export async function mobileV2Route(request: Request, action: () => Promise<Response>) {
  const response = await mobileRoute(request, action);
  if (response.ok) return response;
  const body = mobileErrorSchema.parse(await response.json());
  return Response.json({ version: 2, error: body.error }, { status: response.status, headers: response.headers });
}
export function mobileV2Preflight(request: Request) {
  return mobileV2Route(request, async () => new Response(null, { status: 204 }));
}
