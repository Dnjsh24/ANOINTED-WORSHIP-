import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { readSetlistLibrary, readSongLibrary, type LibraryReadIdentity } from "@/lib/mobile/v2/read-library";
import type { Database } from "@/lib/supabase/database.types";
import { mobileLibraryCacheSchema } from './library-cache';

const identity: LibraryReadIdentity = {
  userId: "11111111-1111-4111-8111-111111111111",
  teamId: "22222222-2222-4222-8222-222222222222",
  memberId: "33333333-3333-4333-8333-333333333333",
};

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | null; error: { message: string; status?: number } | null };

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly filters: Array<{ kind: "eq" | "is" | "gt" | "in"; column: string; value: unknown }> = [];
  private pageLimit = Number.MAX_SAFE_INTEGER;
  private sortColumn: string | null = null;

  constructor(
    private readonly table: string,
    private readonly tables: Record<string, Row[]>,
    private readonly errors: Partial<Record<string, QueryResult["error"]>>,
  ) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push({ kind: "eq", column, value }); return this; }
  is(column: string, value: unknown) { this.filters.push({ kind: "is", column, value }); return this; }
  gt(column: string, value: unknown) { this.filters.push({ kind: "gt", column, value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ kind: "in", column, value }); return this; }
  order(column: string) { this.sortColumn = column; return this; }
  limit(value: number) { this.pageLimit = value; return this; }
  abortSignal() { return this; }

  maybeSingle() {
    const data = this.rows()[0] ?? null;
    return Promise.resolve({ data, error: this.errors[this.table] ?? null });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows(), error: this.errors[this.table] ?? null }).then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    let rows = [...(this.tables[this.table] ?? [])];
    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        const value = row[filter.column];
        if (filter.kind === "eq") return value === filter.value;
        if (filter.kind === "is") return value === filter.value;
        if (filter.kind === "gt") return typeof value === "string" && typeof filter.value === "string" && value > filter.value;
        return Array.isArray(filter.value) && filter.value.includes(value);
      });
    }
    const sortColumn = this.sortColumn;
    if (sortColumn) rows.sort((left, right) => String(left[sortColumn]).localeCompare(String(right[sortColumn])));
    return rows.slice(0, this.pageLimit);
  }
}

function makeClient(
  tables: Record<string, Row[]>,
  authenticatedUserId = identity.userId,
  errors: Partial<Record<string, QueryResult["error"]>> = {},
) {
  const getUser = vi.fn(async (accessToken?: string) => { void accessToken; return { data: { user: authenticatedUserId ? { id: authenticatedUserId } : null }, error: null }; });
  const client = {
    auth: { getUser },
    from: vi.fn((table: string) => new FakeQuery(table, tables, errors)),
  } as unknown as SupabaseClient<Database>;
  return { client, getUser };
}

function makeTables(): Record<string, Row[]> {
  return {
    team_members: [{ id: identity.memberId, profile_id: identity.userId, team_id: identity.teamId, status: "active" }],
    songs: [
      { id: "44444444-4444-4444-8444-444444444444", team_id: identity.teamId, status: "approved", deleted_at: null, title: "Amazing Grace", artist: "Traditional", original_key: "G", bpm: 72, time_signature: "4/4", tags: ["hymn"], lyrics_chords: "[Verse]\n[G]Amazing", youtube_url: null, spotify_url: null, image_url: null, album: null, setlist_songs: [{ count: 2 }] },
      { id: "55555555-5555-4555-8555-555555555555", team_id: identity.teamId, status: "approved", deleted_at: null, title: "Holy Holy", artist: "Alex", original_key: "C", bpm: null, time_signature: "4/4", tags: [], lyrics_chords: "[Chorus]\n[C]Holy", youtube_url: null, spotify_url: null, image_url: null, album: null, setlist_songs: [{ count: 3 }] },
      { id: "66666666-6666-4666-8666-666666666666", team_id: "99999999-9999-4999-8999-999999999999", status: "approved", deleted_at: null, title: "Other Team", artist: "Other", original_key: "D", bpm: null, time_signature: "4/4", tags: [], lyrics_chords: "", youtube_url: null, spotify_url: null, image_url: null, album: null, setlist_songs: [] },
    ],
    song_favorites: [
      { team_member_id: identity.memberId, song_id: "55555555-5555-4555-8555-555555555555" },
      { team_member_id: "99999999-9999-4999-8999-999999999999", song_id: "44444444-4444-4444-8444-444444444444" },
    ],
    setlists: [{
      id: "77777777-7777-4777-8777-777777777777", team_id: identity.teamId, deleted_at: null,
      name: "Sunday Worship", setlist_date: "2026-10-18", location: "Sanctuary", call_time: "08:00:00", rehearsal_time: "07:30:00",
      service_times: ["9:00 AM"], event_id: "88888888-8888-4888-8888-888888888888",
      leader_member_id: identity.memberId, created_by: identity.userId, notes: "Sunday notes", presentation_settings: { theme: "dark" },
      events: { type: "service" }, leader: { profiles: { full_name: "Alex Leader" } },
    }],
    setlist_songs: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", setlist_id: "77777777-7777-4777-8777-777777777777", assigned_key: "D", song_order: 2, lead_member_id: null, youtube_url: null, notes: "Lead: Jordan", arrangement: null, band_notes: null, slide_settings: { enabled: true }, created_at: "2026-10-10T00:00:00Z", song: { id: "55555555-5555-4555-8555-555555555555", title: "Holy Holy", artist: "Alex", bpm: null, original_key: "C", time_signature: "4/4", tags: [], lyrics_chords: "[Chorus]\n[C]Holy", youtube_url: null, spotify_url: null, image_url: null, album: null } },
      { id: "99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa", setlist_id: "77777777-7777-4777-8777-777777777777", assigned_key: "G", song_order: 1, lead_member_id: identity.memberId, youtube_url: "https://youtube.test/slot", notes: null, arrangement: "Acoustic", band_notes: "Soft start", slide_settings: null, created_at: "2026-10-10T00:00:00Z", song: { id: "44444444-4444-4444-8444-444444444444", title: "Amazing Grace", artist: "Traditional", bpm: 72, original_key: "G", time_signature: "3/4", tags: ["hymn"], lyrics_chords: "[Verse]\n[G]Amazing", youtube_url: null, spotify_url: null, image_url: null, album: null } },
    ],
    setlist_change_log: [
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", setlist_id: "77777777-7777-4777-8777-777777777777", team_id: identity.teamId, change_type: "created", summary: "Created setlist", changed_by: identity.userId, created_at: "2026-10-10T00:00:00Z", snapshot: { name: "Before" } },
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", setlist_id: "77777777-7777-4777-8777-777777777777", team_id: identity.teamId, change_type: "song_added", summary: "Added a song", changed_by: null, created_at: "2026-10-12T00:00:00Z", snapshot: { name: "After" } },
    ],
    profiles: [{ id: identity.userId, full_name: "Alex Leader", email: "alex@example.test" }],
  };
}

describe("read-library authenticated RLS readers", () => {
  it("verifies identity and reads every song page with member favorites and website counts", async () => {
    const { client } = makeClient(makeTables());
    const songs = await readSongLibrary({ client, identity, pageSize: 1 });

    expect(songs.map(({ title, favorite, playCount }) => ({ title, favorite, playCount }))).toEqual([
      { title: "Amazing Grace", favorite: false, playCount: 2 },
      { title: "Holy Holy", favorite: true, playCount: 3 },
    ]);
    expect(client.from).toHaveBeenCalledWith("team_members");
  });

  it("reads setlists, ordered slots, leaders, event labels, and all history across pages", async () => {
    const { client } = makeClient(makeTables());
    const setlists = await readSetlistLibrary({ client, identity, pageSize: 1 });

    expect(setlists).toHaveLength(1);
    expect(setlists[0]).toMatchObject({
      leader: "Alex Leader",
      eventLabel: "Service - 9:00 AM",
      songs: [
        { order: 1, assignedKey: "G", arrangement: "Acoustic", bandNotes: "Soft start", song: { title: "Amazing Grace", favorite: false, playCount: 2 } },
        { order: 2, lead: "Jordan", song: { title: "Holy Holy", favorite: true, playCount: 3 } },
      ],
      history: [
        { summary: "Added a song", changedBy: "System" },
        { summary: "Created setlist", changedBy: "Alex Leader" },
      ],
    });
    expect(client.from).toHaveBeenCalledWith("setlist_change_log");
  });

  it("rejects unauthenticated or mismatched context before reading team content", async () => {
    const { client, getUser } = makeClient(makeTables(), "99999999-9999-4999-8999-999999999999");

    await expect(readSongLibrary({ client, identity })).rejects.toThrow("An authenticated user is required");
    expect(getUser).toHaveBeenCalledOnce();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("passes an explicit access token to user verification and preserves definitive status", async () => {
    const { client, getUser } = makeClient(makeTables());
    await readSongLibrary({ client, identity, accessToken: "native-session-token" });
    expect(getUser).toHaveBeenCalledWith("native-session-token");
  });

  it("separates missing membership from membership-query outages", async () => {
    const missingMembership = makeClient({ ...makeTables(), team_members: [] }).client;
    await expect(readSongLibrary({ client: missingMembership, identity }))
      .rejects.toMatchObject({ status: 403, category: "forbidden" });

    const unavailableMembership = makeClient(makeTables(), identity.userId, {
      team_members: { message: "database unavailable", status: 500 },
    }).client;
    await expect(readSongLibrary({ client: unavailableMembership, identity }))
      .rejects.toMatchObject({ status: 503, category: "unavailable" });
  });

  it("fails closed on malformed cursors and retains history for departed or RLS-hidden authors", async () => {
    const malformedSongId = makeTables();
    malformedSongId.songs = [{ ...malformedSongId.songs[0], id: "not-a-uuid" }];
    const malformedClient = makeClient(malformedSongId).client;
    await expect(readSongLibrary({ client: malformedClient, identity }))
      .rejects.toMatchObject({ status: 503 });

    const missingAuthors = makeTables();
    missingAuthors.profiles = [];
    const authorClient = makeClient(missingAuthors).client;
    const setlists = await readSetlistLibrary({ client: authorClient, identity });
    expect(setlists[0].history.find(row => row.changedBy !== 'System')?.changedBy).toBe('Team member');
    expect(mobileLibraryCacheSchema.safeParse({ version: 2, ...identity, songs: await readSongLibrary({ client: authorClient, identity }), setlists }).success).toBe(true);
  });

  it("supports the website most-played sort and rejects invalid page sizes", async () => {
    const sortedClient = makeClient(makeTables()).client;
    const sorted = await readSongLibrary({ client: sortedClient, identity, pageSize: 1, songSort: "playCount" });
    expect(sorted.map((song) => song.title)).toEqual(["Holy Holy", "Amazing Grace"]);

    const invalidClient = makeClient(makeTables()).client;
    await expect(readSongLibrary({ client: invalidClient, identity, pageSize: 0 })).rejects.toThrow("Page size must be between");
    expect(invalidClient.from).not.toHaveBeenCalled();
  });

  it("honors an already-aborted signal before network access", async () => {
    const { client, getUser } = makeClient(makeTables());
    const controller = new AbortController();
    controller.abort();

    await expect(readSongLibrary({ client, identity, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(getUser).not.toHaveBeenCalled();
  });
});
