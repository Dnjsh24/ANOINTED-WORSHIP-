import type { Message } from "@/lib/types";
import { fileKindLabel, formatFileSize } from "@/lib/domain/files";
import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

export const MESSAGE_PAGE_SIZE = 50;

export type MessageCursor = { createdAt: string; id: string };
export type MessageAuthor = { memberId: string; fullName: string; avatarUrl: string | null };
type Supabase = Awaited<ReturnType<typeof createClient>>;
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type MessageReadRow = {
  message_id: string;
  profile_id: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};
type MessageFileRow = Pick<Database["public"]["Tables"]["practice_files"]["Row"], "id" | "storage_path" | "file_name" | "mime_type" | "size_bytes">;

export type MessageHistoryPage = {
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
};

export function encodeMessageCursor(cursor: MessageCursor): string {
  return `${cursor.createdAt}|${cursor.id}`;
}

export function parseMessageCursor(value: string | null | undefined): MessageCursor | null | undefined {
  if (value == null || value === "") return null;
  const [createdAt, id, extra] = value.split("|");
  if (extra !== undefined || !createdAt || !/^\d{4}-\d\d-\d\dT/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id ?? "")) return undefined;
  return { createdAt, id };
}

function displayTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export async function loadMessageHistoryPage(
  supabase: Supabase,
  channelId: string,
  currentMemberId: string,
  authors: MessageAuthor[],
  cursor?: MessageCursor | null,
  searchTerm?: string,
): Promise<MessageHistoryPage> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }
  if (searchTerm) query = query.ilike("body", `%${searchTerm}%`);

  const { data, error } = await query;
  if (error) throw new Error("Messages could not be loaded.");

  const fetchedRows = (data ?? []) as MessageRow[];
  const hasMore = fetchedRows.length > MESSAGE_PAGE_SIZE && !searchTerm;
  const rows = fetchedRows.slice(0, MESSAGE_PAGE_SIZE);
  const messageIds = rows.map((row) => row.id);
  const attachmentIds = Array.from(new Set(rows.map((row) => row.attachment_file_id).filter((id): id is string => Boolean(id))));

  const [readsResult, filesResult] = await Promise.all([
    messageIds.length
      ? supabase.from("message_reads").select("message_id, profile_id, profiles(avatar_url, full_name)").in("message_id", messageIds)
      : Promise.resolve({ data: [], error: null }),
    attachmentIds.length
      ? supabase.from("practice_files").select("id, storage_path, file_name, mime_type, size_bytes").in("id", attachmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const readsByMessageId = new Map<string, MessageReadRow[]>();
  for (const read of (readsResult.data ?? []) as unknown as MessageReadRow[]) {
    const reads = readsByMessageId.get(read.message_id) ?? [];
    reads.push(read);
    readsByMessageId.set(read.message_id, reads);
  }

  const files = (filesResult.data ?? []) as MessageFileRow[];
  const signedUrls = new Map<string, string>();
  if (files.length) {
    try {
      const paths = [...new Set(files.map((file) => file.storage_path))];
      const { data: signedFiles } = await supabase.storage.from("practice-files").createSignedUrls(paths, 60 * 60);
      for (const signed of signedFiles ?? []) {
        if (signed.path && signed.signedUrl && !signed.error) signedUrls.set(signed.path, signed.signedUrl);
      }
    } catch {
      // Keep message text and attachment metadata usable if storage signing fails.
    }
  }

  const attachmentsById = new Map(files.map((file) => [file.id, {
    id: file.id,
    name: file.file_name,
    size: formatFileSize(Number(file.size_bytes)),
    type: fileKindLabel(file.mime_type, file.file_name),
    mimeType: file.mime_type,
    url: signedUrls.get(file.storage_path) ?? "",
  }]));
  const authorsById = new Map(authors.map((author) => [author.memberId, author]));
  const messages = rows.reverse().map((row) => {
    const author = authorsById.get(row.sender_member_id);
    return {
      id: row.id,
      author: author?.fullName ?? "Unknown Member",
      body: row.body,
      avatarUrl: author?.avatarUrl ?? null,
      createdAt: displayTime(row.created_at),
      mine: row.sender_member_id === currentMemberId,
      attachment: row.attachment_file_id ? attachmentsById.get(row.attachment_file_id) : undefined,
      reads: (readsByMessageId.get(row.id) ?? []).map((read) => ({
        profileId: read.profile_id,
        avatarUrl: read.profiles?.avatar_url ?? null,
        fullName: read.profiles?.full_name ?? undefined,
      })),
      parentMessageId: row.parent_message_id,
    } satisfies Message;
  });

  const oldest = rows[0];
  return {
    messages,
    hasMore,
    nextCursor: hasMore && oldest ? encodeMessageCursor({ createdAt: oldest.created_at, id: oldest.id }) : null,
  };
}
