import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setlistDetailSource = readFileSync("src/app/setlists/[id]/page.tsx", "utf8");

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  logActivity: vi.fn(),
  notifyProfiles: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  getSiteUrl: () => "https://worship.example",
  hasSupabaseEnv: () => true,
}));

vi.mock("@/lib/desktop/runtime", () => ({
  isDesktopRuntime: () => false,
}));

vi.mock("@/lib/desktop/workspace", () => ({
  getDesktopSetlist: vi.fn(),
  getDesktopSong: vi.fn(),
  getDesktopSyncDetails: vi.fn(),
  getDesktopSyncSummary: vi.fn(),
  restoreDesktopSong: vi.fn(),
  saveDesktopTeamContext: vi.fn(),
  softDeleteDesktopSetlist: vi.fn(),
  softDeleteDesktopSong: vi.fn(),
  upsertDesktopSetlist: vi.fn(),
  upsertDesktopSong: vi.fn(),
}));

vi.mock("@/lib/desktop/sync", () => ({
  syncDesktopWorkspace: vi.fn(),
}));

vi.mock("@/lib/supabase/team-context", () => ({
  getCurrentTeamContext: vi.fn(),
  getCurrentTeamContextForClient: vi.fn(),
}));

vi.mock("@/lib/domain/activity", () => ({
  logActivity: mocks.logActivity,
}));

vi.mock("@/lib/push-notifications", () => ({
  notifyProfiles: mocks.notifyProfiles,
}));

import { createSetlistAction, updateSetlistAction } from "./actions";

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

function createQuery(result: QueryResult = { data: null, error: null }) {
  const query: Record<string, unknown> = {};
  for (const method of ["delete", "eq", "in", "insert", "limit", "neq", "order", "select", "update", "upsert"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query as {
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

function createSupabase(
  eventResult: QueryResult = {
    data: {
      id: "event-1",
      type: "service",
      event_date: "2026-08-16",
      location: "Main Sanctuary",
      starts_at: "10:00",
      call_time: "09:00",
      rehearsal_time: "08:00",
      service_type: "Sunday Worship",
      setlists: [],
    },
    error: null,
  },
  setlistResult: QueryResult = { data: { id: "setlist-1" }, error: null },
) {
  const membershipQuery = createQuery({
    data: { id: "member-1", team_id: "team-1", role: "owner", status: "active" },
    error: null,
  });
  const eventQuery = createQuery(eventResult);
  const setlistQuery = createQuery(setlistResult);
  const changeLogQuery = createQuery({ data: null, error: null });
  const notificationRecipientsQuery = createQuery({ data: [], error: null });
  let teamMemberCalls = 0;

  return {
    client: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "team_members") {
          teamMemberCalls += 1;
          return teamMemberCalls === 1 ? membershipQuery : notificationRecipientsQuery;
        }
        if (table === "events") return eventQuery;
        if (table === "setlists") return setlistQuery;
        if (table === "setlist_change_log") return changeLogQuery;
        return createQuery();
      }),
    },
    eventQuery,
    setlistQuery,
  };
}

function createSetlistFormData(eventId?: string) {
  const formData = new FormData();
  formData.set("title", "Sunday Worship");
  formData.set("serviceDate", "2026-08-16");
  formData.set("eventType", "service");
  formData.set("serviceType", "Sunday Worship");
  formData.set("location", "Main Sanctuary");
  formData.set("callTime", "09:00");
  formData.set("rehearsalTime", "08:00");
  if (eventId) formData.set("eventId", eventId);
  return formData;
}

describe("setlist event linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("creates a standalone setlist without adding an event to the Timeline", async () => {
    const supabase = createSupabase();
    mocks.createClient.mockResolvedValue(supabase.client);

    await expect(createSetlistAction({ ok: false, message: "" }, createSetlistFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/setlists/setlist-1",
    );

    expect(supabase.eventQuery.insert).not.toHaveBeenCalled();
    expect(supabase.setlistQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: null,
        name: "Sunday Worship",
      }),
    );
  });

  it("links a setlist to an explicitly selected Timeline event without creating another event", async () => {
    const supabase = createSupabase();
    mocks.createClient.mockResolvedValue(supabase.client);

    await expect(
      createSetlistAction({ ok: false, message: "" }, createSetlistFormData("existing-event")),
    ).rejects.toThrow("NEXT_REDIRECT:/setlists/setlist-1");

    expect(supabase.eventQuery.insert).not.toHaveBeenCalled();
    expect(supabase.eventQuery.update).not.toHaveBeenCalled();
    expect(supabase.eventQuery.eq).toHaveBeenCalledWith("id", "existing-event");
    expect(supabase.eventQuery.eq).toHaveBeenCalledWith("team_id", "team-1");
    expect(supabase.eventQuery.select).toHaveBeenCalledWith(expect.stringContaining("service_type"));
    expect(supabase.eventQuery.maybeSingle).toHaveBeenCalled();
    expect(supabase.setlistQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: "existing-event" }),
    );
  });

  it("rejects an event link that is not available in the active team", async () => {
    const supabase = createSupabase({ data: null, error: null });
    mocks.createClient.mockResolvedValue(supabase.client);

    await expect(
      createSetlistAction({ ok: false, message: "" }, createSetlistFormData("foreign-or-missing-event")),
    ).resolves.toEqual({
      ok: false,
      message: "The selected Timeline event is unavailable.",
    });

    expect(supabase.setlistQuery.insert).not.toHaveBeenCalled();
  });

  it("keeps an unlinked setlist off the Timeline when its details are edited", async () => {
    const supabase = createSupabase();
    mocks.createClient.mockResolvedValue(supabase.client);
    const formData = createSetlistFormData();
    formData.set("setlistId", "setlist-1");

    await expect(updateSetlistAction({ ok: false, message: "" }, formData)).resolves.toEqual({
      ok: true,
      message: "Setlist saved.",
    });

    expect(supabase.eventQuery.insert).not.toHaveBeenCalled();
    expect(supabase.setlistQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: null }),
    );
  });

  it("does not edit a linked Timeline event when setlist details are edited", async () => {
    const supabase = createSupabase(
      { data: { id: "event-1" }, error: null },
      { data: { id: "setlist-1", event_id: "event-1" }, error: null },
    );
    mocks.createClient.mockResolvedValue(supabase.client);
    const formData = createSetlistFormData();
    formData.set("setlistId", "setlist-1");

    await expect(updateSetlistAction({ ok: false, message: "" }, formData)).resolves.toEqual({
      ok: true,
      message: "Setlist saved.",
    });

    expect(supabase.eventQuery.update).not.toHaveBeenCalled();
    expect(supabase.setlistQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: "event-1" }),
    );
  });

  it("does not treat a standalone setlist ID as an attendance event ID", () => {
    expect(setlistDetailSource).toContain("<AttendanceToggle eventId={linkedEvent.id}");
    expect(setlistDetailSource).not.toContain("eventId: dbSetlist.event_id || id");
    expect(setlistDetailSource).not.toContain("eventId: sample.eventId || sample.id");
    expect(setlistDetailSource).toContain("{linkedEvent ? (");
  });
});
