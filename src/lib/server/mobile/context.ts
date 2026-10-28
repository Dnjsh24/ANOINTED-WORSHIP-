import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canForTeam } from "@/lib/domain/permission-overrides";
import { permissionValues } from "@/lib/domain/wooly-permissions";
import type { MobileIdentity } from "@/lib/mobile/contracts";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getCurrentTeamContextForClient } from "@/lib/supabase/team-context-client";
import { MobileApiError } from '@/lib/mobile/errors';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { z } from 'zod';
export { MobileApiError } from '@/lib/mobile/errors';

type MobileDatabase = Omit<Database, "public"> & { public: Database["public"] & { Functions: Database["public"]["Functions"] & {
  mobile_apply_command: { Args: { p_team_id: string; p_command: Json }; Returns: Json };
  mobile_download_page: { Args: { p_team_id: string; p_selection: Json; p_cursor: Json | null; p_manifest_id: string | null }; Returns: Json };
} } };

export async function requireMobileContext(request: Request, requirePinnedScope = false) {
  if (!hasSupabaseEnv()) throw new MobileApiError(503, "unavailable", "Account services are unavailable.");
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization) || authorization.length > 8192) {
    throw new MobileApiError(401, "session", "Sign in to sync this device.");
  }
  const { url, publishableKey } = getSupabaseEnv();
  const client = createClient<MobileDatabase>(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  if (requirePinnedScope) {
    const userId = z.uuid().safeParse(request.headers.get('x-mobile-user-id'));
    const teamId = z.uuid().safeParse(request.headers.get('x-mobile-team-id'));
    if (!userId.success || !teamId.success) throw new MobileApiError(409, 'scope_changed', 'Reopen the matching account and team to sync these drafts.');
    const { data: { user }, error } = await client.auth.getUser(authorization.slice('Bearer '.length));
    if (error || !user) throw new MobileApiError(error && error.status !== 401 && error.status !== 403 ? 503 : 401, 'session', 'Account verification could not be completed. Sign in again if your session expired.');
    if (user.id !== userId.data) throw new MobileApiError(409, 'scope_changed', 'Reopen the matching account to sync these drafts.');
    const limit = await rateLimit(`mobile:v1:${user.id}`, 90, 60_000);
    if (!limit.allowed) throw new MobileApiError(429, 'rate_limit', 'Wait a minute before syncing again.');
    const workspace = await readSelectedWorkspace({ client: client as SupabaseClient<Database>, userId: user.id, teamId: teamId.data });
    return { client, identity: { userId: user.id, ...workspace } };
  }
  // getCurrentTeamContextForClient verifies the custom Bearer header with Auth.
  // The schema extension adds only RPC declarations; existing tables are identical.
  const context = await getCurrentTeamContextForClient(client as SupabaseClient<Database>, { accessToken: authorization.slice('Bearer '.length) });
  if (!context.userId) throw new MobileApiError(401, "session", "Sign in to sync this device.");
  if (!context.teamId || !context.memberId) throw new MobileApiError(403, "membership", "Active team membership is required.");
  const limit = await rateLimit(`mobile:v1:${context.userId}`, 90, 60_000);
  if (!limit.allowed) throw new MobileApiError(429, "rate_limit", "Wait a minute before syncing again.");
  const identity: MobileIdentity = {
    userId: context.userId, teamId: context.teamId, memberId: context.memberId,
    teamName: context.teamName, role: context.role,
    permissions: permissionValues.filter(permission => canForTeam(context, permission)),
  };
  return { client, identity };
}
