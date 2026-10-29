import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  getSetlistReadModel,
  getSongReadModel,
  type MobileSetlistReadModel,
  type MobileSongReadModel,
} from "@/lib/mobile/v2/library-read-models";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Client = SupabaseClient<Database>;
type QueryResult<Row> = { data: Row[] | null; error: { message: string } | null };
type PageFetcher<Row> = (after: string | null) => PromiseLike<QueryResult<Row>>;

export type LibraryReadIdentity = {
  userId: string;
  teamId: string;
  memberId: string;
};

export type ReadLibraryOptions = {
  client: Client;
  identity: LibraryReadIdentity;
  accessToken?: string;
  signal?: AbortSignal;
  pageSize?: number;
  songSort?: "title" | "playCount";
  setlistSort?: "ascending" | "descending";
};

export class LibraryReadError extends Error {
  readonly status: number;
  readonly category: "unauthorized" | "forbidden" | "unavailable";

  constructor(message: string, status = 503) {
    super(message);
    this.name = "LibraryReadError";
    this.status = status;
    this.category = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "unavailable";
  }
}

type VerifiedIdentity = Readonly<LibraryReadIdentity>;

export async function readSongLibrary(options: ReadLibraryOptions): Promise<MobileSongReadModel[]> {
  const { client, signal, pageSize = DEFAULT_PAGE_SIZE, songSort = "title" } = options;
  validatePageSize(pageSize);
  const identity = await verifyIdentity(client, options.identity, options.accessToken, signal);
  return readSongLibraryForIdentity(client, identity, pageSize, signal, songSort);
}

export async function readSetlistLibrary(options: ReadLibraryOptions): Promise<MobileSetlistReadModel[]> {
  const { client, signal, pageSize = DEFAULT_PAGE_SIZE, songSort = "title", setlistSort = "descending" } = options;
  validatePageSize(pageSize);
  const identity = await verifyIdentity(client, options.identity, options.accessToken, signal);
  const [setlistRows, songs] = await Promise.all([
    readSetlistRows(client, identity, pageSize, signal),
    readSongLibraryForIdentity(client, identity, pageSize, signal, songSort),
  ]);
  if (setlistRows.length === 0) return [];

  const setlistIds = setlistRows.map((row) => row.id);
  const [slotRows, historyRows] = await Promise.all([
    readSetlistSlots(client, identity, setlistIds, pageSize, signal),
    readSetlistHistory(client, identity, setlistIds, pageSize, signal),
  ]);
  assertForeignKeys(slotRows, setlistIds, "Setlist songs");
  assertForeignKeys(historyRows, setlistIds, "Setlist history");
  const changerNames = await readChangerNames(client, historyRows, pageSize, signal);
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const slotsBySetlist = groupRows(slotRows, (row) => row.setlist_id);
  const historyBySetlist = groupRows(historyRows, (row) => row.setlist_id);

  return setlistRows.map((row) => getSetlistReadModel(
    row,
    slotsBySetlist.get(row.id) ?? [],
    historyBySetlist.get(row.id) ?? [],
    changerNames,
    songsById,
  )).sort((left, right) => (setlistSort === "ascending" ? 1 : -1) * left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}

async function verifyIdentity(client: Client, identity: LibraryReadIdentity, accessToken?: string, signal?: AbortSignal): Promise<VerifiedIdentity> {
  throwIfAborted(signal);
  validateIdentity(identity);

  let authResult: Awaited<ReturnType<Client["auth"]["getUser"]>>;
  try {
    authResult = await client.auth.getUser(accessToken);
  } catch (error) {
    throwIfAborted(signal);
    throw toLibraryReadError("User authentication could not be verified.", error, true);
  }
  const { data: { user }, error: authError } = authResult;
  throwIfAborted(signal);
  if (authError) throw toLibraryReadError("User authentication could not be verified.", authError, true);
  if (!user || user.id !== identity.userId) throw new LibraryReadError("An authenticated user is required to read this library.", 401);

  let membershipQuery = client.from("team_members")
    .select("id,team_id,profile_id,status")
    .eq("id", identity.memberId)
    .eq("team_id", identity.teamId)
    .eq("profile_id", identity.userId)
    .eq("status", "active");
  if (signal) membershipQuery = membershipQuery.abortSignal(signal);
  let membershipResult: Awaited<ReturnType<typeof membershipQuery.maybeSingle>>;
  try {
    membershipResult = await membershipQuery.maybeSingle();
  } catch (error) {
    throwIfAborted(signal);
    throw toLibraryReadError("Team membership could not be verified.", error);
  }
  const { data: membership, error: membershipError } = membershipResult;
  throwIfAborted(signal);
  if (membershipError) {
    throw toLibraryReadError("Team membership could not be verified.", membershipError);
  }
  if (!isRecord(membership) || membership.id !== identity.memberId || membership.team_id !== identity.teamId
    || membership.profile_id !== identity.userId || membership.status !== "active") {
    throw new LibraryReadError("An active team membership is required to read this library.", 403);
  }

  return Object.freeze({ ...identity });
}

async function readSongLibraryForIdentity(
  client: Client,
  identity: VerifiedIdentity,
  pageSize: number,
  signal?: AbortSignal,
  sortBy: "title" | "playCount" = "title",
): Promise<MobileSongReadModel[]> {
  const songRows = await readKeysetPages(
    (after) => {
      let query = client.from("songs")
        .select("id,title,artist,original_key,bpm,time_signature,tags,lyrics_chords,youtube_url,spotify_url,image_url,album,setlist_songs(count)")
        .eq("team_id", identity.teamId)
        .eq("status", "approved")
        .is("deleted_at", null);
      if (after) query = query.gt("id", after);
      query = query.order("id", { ascending: true }).limit(pageSize);
      if (signal) query = query.abortSignal(signal);
      return query;
    },
    (row) => row.id,
    pageSize,
    signal,
    "Song library could not be loaded.",
  );
  const favoriteIds = await readFavoriteSongIds(client, identity.memberId, pageSize, signal);
  return songRows
    .map((row) => getSongReadModel(row, favoriteIds.has(row.id)))
    .sort((left, right) => (sortBy === "playCount" ? (right.playCount ?? 0) - (left.playCount ?? 0) : 0)
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id));
}

async function readFavoriteSongIds(client: Client, memberId: string, pageSize: number, signal?: AbortSignal): Promise<Set<string>> {
  const rows = await readKeysetPages(
    (after) => {
      let query = client.from("song_favorites").select("song_id").eq("team_member_id", memberId);
      if (after) query = query.gt("song_id", after);
      query = query.order("song_id", { ascending: true }).limit(pageSize);
      if (signal) query = query.abortSignal(signal);
      return query;
    },
    (row) => row.song_id,
    pageSize,
    signal,
    "Favorite songs could not be loaded.",
  );
  return new Set(rows.map((row) => row.song_id));
}

async function readSetlistRows(client: Client, identity: VerifiedIdentity, pageSize: number, signal?: AbortSignal) {
  return readKeysetPages(
    (after) => {
      let query = client.from("setlists")
        .select("id,name,setlist_date,location,call_time,rehearsal_time,service_times,event_id,leader_member_id,created_by,notes,presentation_settings,events(type),leader:team_members!setlists_leader_member_id_fkey(id,profiles(full_name))")
        .eq("team_id", identity.teamId)
        .is("deleted_at", null);
      if (after) query = query.gt("id", after);
      query = query.order("id", { ascending: true }).limit(pageSize);
      if (signal) query = query.abortSignal(signal);
      return query;
    },
    (row) => row.id,
    pageSize,
    signal,
    "Setlists could not be loaded.",
  );
}

async function readSetlistSlots(
  client: Client,
  identity: VerifiedIdentity,
  setlistIds: string[],
  pageSize: number,
  signal?: AbortSignal,
) {
  const rows: Array<{ id: string; setlist_id: string; [key: string]: unknown }> = [];
  for (const setlistIdBatch of chunks(setlistIds, pageSize)) {
    throwIfAborted(signal);
    const batch = await readKeysetPages(
      (after) => {
        let query = client.from("setlist_songs")
          .select("id,setlist_id,assigned_key,song_order,lead_member_id,youtube_url,notes,arrangement,band_notes,slide_settings,created_at,song:songs(id,title,artist,original_key,bpm,time_signature,tags,lyrics_chords,youtube_url,spotify_url,image_url,album)")
          .in("setlist_id", setlistIdBatch);
        if (after) query = query.gt("id", after);
        query = query.order("id", { ascending: true }).limit(pageSize);
        if (signal) query = query.abortSignal(signal);
        return query;
      },
      (row) => row.id,
      pageSize,
      signal,
      "Setlist songs could not be loaded.",
    );
    rows.push(...batch);
  }
  return rows;
}

async function readSetlistHistory(
  client: Client,
  identity: VerifiedIdentity,
  setlistIds: string[],
  pageSize: number,
  signal?: AbortSignal,
) {
  const rows: Array<{ id: string; setlist_id: string; changed_by: string | null; [key: string]: unknown }> = [];
  for (const setlistIdBatch of chunks(setlistIds, pageSize)) {
    throwIfAborted(signal);
    const batch = await readKeysetPages(
      (after) => {
        let query = client.from("setlist_change_log")
          .select("id,setlist_id,change_type,summary,changed_by,created_at,snapshot")
          .eq("team_id", identity.teamId)
          .in("setlist_id", setlistIdBatch);
        if (after) query = query.gt("id", after);
        query = query.order("id", { ascending: true }).limit(pageSize);
        if (signal) query = query.abortSignal(signal);
        return query;
      },
      (row) => row.id,
      pageSize,
      signal,
      "Setlist history could not be loaded.",
    );
    rows.push(...batch);
  }
  return rows;
}

async function readChangerNames(
  client: Client,
  historyRows: readonly { changed_by: string | null }[],
  pageSize: number,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const changerIds = [...new Set(historyRows.flatMap((row) => row.changed_by ? [row.changed_by] : []))];
  const names = new Map<string, string>();
  for (const changerIdBatch of chunks(changerIds, pageSize)) {
    throwIfAborted(signal);
    let query = client.from("profiles").select("id,full_name,email").in("id", changerIdBatch);
    query = query.order("id", { ascending: true }).limit(pageSize);
    if (signal) query = query.abortSignal(signal);
    let result: Awaited<typeof query>;
    try {
      result = await query;
    } catch (error) {
      throwIfAborted(signal);
      throw toLibraryReadError("Setlist history authors could not be loaded.", error);
    }
    const { data, error } = result;
    throwIfAborted(signal);
    if (error) throw toLibraryReadError("Setlist history authors could not be loaded.", error);
    if (!Array.isArray(data) || data.length > changerIdBatch.length) {
      throw new LibraryReadError("Setlist history authors response is invalid.", 503);
    }
    for (const profile of data) {
      if (typeof profile.id !== "string" || !UUID_PATTERN.test(profile.id) || !changerIdBatch.includes(profile.id)
        || (profile.full_name !== null && typeof profile.full_name !== "string")
        || (profile.email !== null && typeof profile.email !== "string")) {
        throw new LibraryReadError("Setlist history authors response is invalid.", 503);
      }
      names.set(profile.id, profile.full_name ?? profile.email ?? "Team member");
    }
  }
  return names;
}

async function readKeysetPages<Row>(
  fetchPage: PageFetcher<Row>,
  getCursor: (row: Row) => string,
  pageSize: number,
  signal: AbortSignal | undefined,
  errorMessage: string,
): Promise<Row[]> {
  const allRows: Row[] = [];
  let cursor: string | null = null;

  while (true) {
    throwIfAborted(signal);
    let result: QueryResult<Row>;
    try {
      result = await fetchPage(cursor);
    } catch (error) {
      throwIfAborted(signal);
      throw toLibraryReadError(errorMessage, error);
    }
    const { data, error } = result;
    throwIfAborted(signal);
    if (error) throw toLibraryReadError(errorMessage, error);

    if (!Array.isArray(data) || data.length > pageSize) throw new LibraryReadError(`${errorMessage} The response page was invalid.`, 503);
    const page = data;
    if (page.length === 0) break;
    let pageCursor: string | null = cursor;
    for (const row of page) {
      const nextCursor = getCursor(row);
      if (typeof nextCursor !== "string" || !UUID_PATTERN.test(nextCursor) || (pageCursor !== null && nextCursor <= pageCursor)) {
        throw new LibraryReadError("The library response did not advance its pagination cursor.");
      }
      pageCursor = nextCursor;
    }
    allRows.push(...page);
    cursor = pageCursor;
    if (page.length < pageSize) break;
  }

  return allRows;
}

function validateIdentity(identity: LibraryReadIdentity): void {
  if (![identity.userId, identity.teamId, identity.memberId].every((id) => UUID_PATTERN.test(id))) {
    throw new LibraryReadError("The library identity is invalid.");
  }
}

function validatePageSize(pageSize: number): void {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new LibraryReadError(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function groupRows<Row extends { setlist_id: string }>(rows: readonly Row[], getSetlistId: (row: Row) => string): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const setlistId = getSetlistId(row);
    const group = grouped.get(setlistId);
    if (group) group.push(row);
    else grouped.set(setlistId, [row]);
  }
  return grouped;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new DOMException("The library read was aborted.", "AbortError");
  }
}

function toLibraryReadError(message: string, error?: unknown, authentication = false): LibraryReadError {
  if (isRecord(error)) {
    const record = error;
    const status = typeof record.status === "number" ? record.status
      : typeof record.statusCode === "number" ? record.statusCode : 503;
    const code = typeof record.code === "string" ? record.code : "";
    const name = typeof record.name === "string" ? record.name : "";
    const mappedStatus = authentication && (status === 401 || status === 403) ? status
      : ["PGRST301", "PGRST302", "PGRST303"].includes(code) || name === "AuthSessionMissingError" ? 401 : 503;
    return new LibraryReadError(message, mappedStatus);
  }
  return new LibraryReadError(message, 503);
}

function assertForeignKeys<Row extends { id: string; setlist_id: string }>(rows: readonly Row[], allowedSetlistIds: readonly string[], label: string): void {
  const allowed = new Set(allowedSetlistIds);
  if (rows.some((row) => typeof row.id !== "string" || !UUID_PATTERN.test(row.id)
    || typeof row.setlist_id !== "string" || !UUID_PATTERN.test(row.setlist_id) || !allowed.has(row.setlist_id))) {
    throw new LibraryReadError(`${label} response is invalid.`, 503);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
