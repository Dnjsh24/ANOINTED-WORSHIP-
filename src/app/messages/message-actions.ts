"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { can } from "@/lib/domain/rbac";
import { loadMessageHistoryPage, parseMessageCursor, type MessageAuthor, type MessageHistoryPage } from "@/lib/supabase/message-data";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { messageSchema } from "@/lib/domain/validators";
import { safeErrorDetails } from "@/lib/server/safe-error";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
type RpcMessageRow = { id: string; created_at: string };
type MemberRow = { id: string; profiles: { full_name: string | null; avatar_url: string | null } | null };

const uuidSchema = z.string().uuid();

async function getMemberAuthors(teamId: string): Promise<MessageAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("id, profiles(full_name, avatar_url)")
    .eq("team_id", teamId);
  return ((data ?? []) as unknown as MemberRow[]).map((member) => ({
    memberId: member.id,
    fullName: member.profiles?.full_name || "Unknown Member",
    avatarUrl: member.profiles?.avatar_url ?? null,
  }));
}

async function canReadChannel(channelId: string, teamId: string, memberId: string) {
  const supabase = await createClient();
  const [channelResult, membershipResult] = await Promise.all([
    supabase.from("message_channels").select("id").eq("id", channelId).eq("team_id", teamId).maybeSingle(),
    supabase.from("message_channel_members").select("channel_id").eq("channel_id", channelId).eq("team_member_id", memberId).maybeSingle(),
  ]);
  return Boolean(channelResult.data && membershipResult.data);
}

export async function loadChannelMessagesAction(channelId: string, cursorValue?: string | null): Promise<Result<MessageHistoryPage>> {
  if (!uuidSchema.safeParse(channelId).success) return { ok: false, message: "This conversation is unavailable." };
  const cursor = parseMessageCursor(cursorValue);
  if (cursor === undefined) return { ok: false, message: "Message history cursor is invalid." };
  const context = await getRequiredTeamContext();
  if (!hasSupabaseEnv() || !context.teamId || !context.memberId) return { ok: false, message: "Sign in to load this conversation." };

  try {
    if (!(await canReadChannel(channelId, context.teamId, context.memberId))) return { ok: false, message: "This conversation is unavailable." };
    const supabase = await createClient();
    const authors = await getMemberAuthors(context.teamId);
    const page = await loadMessageHistoryPage(supabase, channelId, context.memberId, authors, cursor);
    return { ok: true, data: page };
  } catch {
    return { ok: false, message: "Messages could not be loaded. Try again." };
  }
}

export async function searchChannelMessagesAction(channelId: string, searchTerm: string): Promise<Result<MessageHistoryPage>> {
  if (!uuidSchema.safeParse(channelId).success) return { ok: false, message: "This conversation is unavailable." };
  const term = z.string().trim().min(1).max(80).safeParse(searchTerm);
  if (!term.success) return { ok: false, message: "Enter a shorter search phrase." };
  const context = await getRequiredTeamContext();
  if (!hasSupabaseEnv() || !context.teamId || !context.memberId) return { ok: false, message: "Sign in to search messages." };

  try {
    if (!(await canReadChannel(channelId, context.teamId, context.memberId))) return { ok: false, message: "This conversation is unavailable." };
    const supabase = await createClient();
    const authors = await getMemberAuthors(context.teamId);
    const page = await loadMessageHistoryPage(supabase, channelId, context.memberId, authors, null, term.data);
    return { ok: true, data: page };
  } catch {
    return { ok: false, message: "Message search failed. Try again." };
  }
}

export async function sendMessageOnceAction(formData: FormData): Promise<ActionState> {
  const parsed = messageSchema.safeParse({
    channelId: formData.get("channelId"),
    body: formData.get("body"),
    attachmentFileId: formData.get("attachmentFileId") || undefined,
    scheduledFor: formData.get("scheduledFor") || undefined,
    parentMessageId: formData.get("parentMessageId") || undefined,
  });
  const clientNonce = uuidSchema.safeParse(formData.get("clientNonce"));
  if (!parsed.success || !clientNonce.success) {
    return { ok: false, message: "Message details are invalid. Review the message and try again." };
  }

  const context = await getRequiredTeamContext();
  if (!hasSupabaseEnv() || !context.teamId || !context.memberId) return { ok: false, message: "Sign in with Supabase to send messages." };
  if (!can(context.role, "messages.send", context.customPermissions)) return { ok: false, message: "You do not have permission to send messages." };

  try {
    const supabase = await createClient();
    const rpc = (supabase as unknown as RpcClient).rpc;
    const { data, error } = await rpc.call(supabase, "send_message_once", {
      p_channel_id: parsed.data.channelId,
      p_client_nonce: clientNonce.data,
      p_body: parsed.data.body,
      p_attachment_file_id: parsed.data.attachmentFileId ?? null,
      p_scheduled_for: parsed.data.scheduledFor ?? null,
      p_parent_message_id: parsed.data.parentMessageId ?? null,
    });
    if (error) {
      console.error("Idempotent message send failed:", safeErrorDetails(error));
      return { ok: false, message: "Message could not be sent. Retry to try again safely." };
    }

    const row = (Array.isArray(data) ? data[0] : data) as RpcMessageRow | null;
    if (!row?.id || !row.created_at) return { ok: false, message: "Message confirmation could not be read. Retry safely." };
    return { ok: true, message: "Message sent.", data: { messageId: row.id, createdAt: row.created_at } };
  } catch {
    return { ok: false, message: "Message could not be sent. Retry to try again safely." };
  }
}
