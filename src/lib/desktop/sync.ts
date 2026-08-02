import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { TeamContext } from "@/lib/supabase/team-context";
import {
  listPendingDesktopMutations,
  markDesktopMutationApplied,
  recordDesktopConflict,
  replaceDesktopSnapshot,
  setDesktopSyncTimestamp,
} from "@/lib/desktop/workspace";

type Supabase = SupabaseClient<Database>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toRecords(values: unknown[] | null): Array<Record<string, unknown>> {
  return (values ?? []).map((value) => asRecord(value) ?? {});
}

export type DesktopSyncResult = {
  ok: boolean;
  message: string;
  applied: number;
  conflicts: number;
};

/**
 * The RPC path is used after the accompanying Supabase migration is deployed.
 * The direct read fallback lets a newly installed desktop app bootstrap safely
 * while an administrator is applying the migration.
 */
export async function syncDesktopWorkspace(supabase: Supabase, context: TeamContext): Promise<DesktopSyncResult> {
  if (!context.userId || !context.teamId || !context.memberId) {
    return { ok: false, message: "Sign in to a team before syncing this PC.", applied: 0, conflicts: 0 };
  }

  let applied = 0;
  let conflicts = 0;
  const mutations = listPendingDesktopMutations();

  for (const mutation of mutations) {
    const { data, error } = await supabase.rpc("apply_worship_mutation", {
      p_device_id: "desktop",
      p_mutation_id: mutation.mutationId,
      p_command: mutation.command,
      // Outbox payloads were serialized to JSON before reaching this boundary.
      p_payload: mutation.payload as Json,
      p_base_revision: mutation.baseRevision,
    });

    // The cloud migration may not be applied yet. Keep the mutation safely in
    // the outbox instead of attempting an unsafe direct write.
    if (error) {
      if (/function|schema cache|apply_worship_mutation/i.test(error.message)) {
        return {
          ok: false,
          message:
            "The server has not been upgraded for desktop synchronization yet. Your offline changes are safely queued on this PC.",
          applied,
          conflicts,
        };
      }
      return { ok: false, message: error.message, applied, conflicts };
    }

    const mutationResult = asRecord(data);
    if (mutationResult?.status === "conflict") {
      recordDesktopConflict({
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        localPayload: mutation.payload,
        cloudPayload: asRecord(mutationResult.cloud_payload) ?? {},
        mutationId: mutation.mutationId,
      });
      conflicts += 1;
      continue;
    }

    markDesktopMutationApplied(mutation.mutationId);
    applied += 1;
  }

  // Never replace the local cache while a queued mutation or conflict remains.
  // That would risk overwriting the local side before the user can resolve it.
  if (conflicts > 0 || listPendingDesktopMutations().length > 0) {
    return {
      ok: conflicts === 0,
      message:
        conflicts > 0
          ? "Synchronization needs conflict resolution. Both versions are preserved locally."
          : "Some offline changes are still queued; the local cache was left untouched.",
      applied,
      conflicts,
    };
  }

  const [songsResult, eventsResult, setlistsResult] = await Promise.all([
    supabase.from("songs").select("*").eq("team_id", context.teamId),
    supabase.from("events").select("*").eq("team_id", context.teamId),
    supabase.from("setlists").select("*").eq("team_id", context.teamId),
  ]);

  const firstError = songsResult.error ?? eventsResult.error ?? setlistsResult.error;
  if (firstError) {
    return { ok: false, message: firstError.message, applied, conflicts };
  }

  const setlistIds = (setlistsResult.data ?? []).map((setlist) => setlist.id);
  const setlistSongsResult = setlistIds.length > 0
    ? await supabase.from("setlist_songs").select("*").in("setlist_id", setlistIds)
    : { data: [], error: null };

  if (setlistSongsResult.error) {
    return { ok: false, message: setlistSongsResult.error.message, applied, conflicts };
  }

  replaceDesktopSnapshot({
    context,
    songs: toRecords(songsResult.data),
    events: toRecords(eventsResult.data),
    setlists: toRecords(setlistsResult.data),
    setlistSongs: toRecords(setlistSongsResult.data),
  });
  setDesktopSyncTimestamp();
  return { ok: true, message: conflicts ? "Synced with conflicts needing review." : "Workspace synced.", applied, conflicts };
}
