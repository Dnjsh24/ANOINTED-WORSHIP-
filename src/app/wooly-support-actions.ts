"use server";

import { z } from "zod";
import { woolyPageGuides } from "@/lib/domain/wooly-page-guides";
import { helpArticleSchema, safeWoolyPagePath, supportReplySchema, supportRequestSchema, type HelpArticle, type SupportMessage, type SupportRequest, type SupportStatus, type WoolyActionResult } from "@/lib/domain/wooly-chat";
import { requireWoolyAccount, requireWoolySupport } from "@/lib/server/wooly-context";
import type { WoolyAudience } from "@/lib/domain/wooly";

const failed = { ok: false as const, message: "Website support is unavailable. Your draft is still here; please retry later." };
const invalid = { ok: false as const, message: "Check the question and details before trying again." };
const changedAccount = { ok: false as const, code: "session" as const, message: "Your account changed. Reopen Wooly before sending." };
function failure(error: unknown): Extract<WoolyActionResult<never>, { ok: false }> {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return code === "session" || code === "support" || code === "rate-limit" ? { ...failed, code, message: error instanceof Error ? error.message : failed.message } : failed;
}

export async function submitWoolyRequestAction(value: unknown): Promise<WoolyActionResult<string>> {
  const input = supportRequestSchema.safeParse(value);
  if (!input.success) return invalid;
  try {
    const { client, context } = await requireWoolyAccount("submit", 5);
    if (input.data.expectedProfileId && input.data.expectedProfileId !== context.userId) return changedAccount;
    const result = await client.rpc("create_wooly_support_request", {
      p_id: input.data.id, p_question: input.data.question, p_details: input.data.details,
      p_page_path: safeWoolyPagePath(input.data.pagePath), p_team_id: context.teamId,
    });
    return result.error || !result.data ? failed : { ok: true, data: result.data };
  } catch (error) { return failure(error); }
}

export async function listMyWoolyRequestsAction(offset = 0): Promise<WoolyActionResult<{ requests: SupportRequest[]; isSupport: boolean; unread: number; audience: WoolyAudience }>> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return invalid;
  try {
    const { client, context, audience } = await requireWoolyAccount("list", 60);
    const [requests, role, unread] = await Promise.all([
      client.from("wooly_support_requests").select("*").eq("profile_id", context.userId!).order("updated_at", { ascending: false }).order("id").range(offset, offset + 49),
      client.rpc("is_wooly_support"),
      client.rpc("wooly_unread_count"),
    ]);
    return requests.error || unread.error || !requests.data ? failed : { ok: true, data: { requests: requests.data, isSupport: role.data === true && !role.error, unread: unread.data ?? 0, audience } };
  } catch (error) { return failure(error); }
}

export async function readWoolyThreadAction(id: unknown, asSupport = false): Promise<WoolyActionResult<{ request: SupportRequest; messages: SupportMessage[] }>> {
  if (!z.uuid().safeParse(id).success) return invalid;
  try {
    const { client, context } = asSupport ? await requireWoolySupport() : await requireWoolyAccount("thread", 60);
    let query = client.from("wooly_support_requests").select("*").eq("id", id as string);
    if (!asSupport) query = query.eq("profile_id", context.userId!);
    const request = await query.maybeSingle();
    if (request.error || !request.data) return failed;
    const messages = await client.from("wooly_support_messages").select("*").eq("request_id", id as string).order("created_at", { ascending: false }).limit(200);
    if (messages.error || !messages.data) return failed;
    if (!asSupport) {
      // Mark only the snapshot we fetched; a concurrent newer reply remains unread.
      const read = await client.rpc("read_wooly_support_request", { p_id: id as string, p_read_until: request.data.support_updated_at ?? request.data.created_at });
      if (!read.error) request.data.requester_read_at = request.data.support_updated_at ?? request.data.created_at;
    }
    return { ok: true, data: { request: request.data, messages: messages.data.reverse() } };
  } catch (error) { return failure(error); }
}

export async function replyWoolyThreadAction(value: unknown): Promise<WoolyActionResult<string>> {
  const input = supportReplySchema.safeParse(value);
  if (!input.success) return invalid;
  try {
    const { client, context } = input.data.asSupport ? await requireWoolySupport() : await requireWoolyAccount("reply", 10);
    if (input.data.expectedProfileId && input.data.expectedProfileId !== context.userId) return changedAccount;
    const result = await client.rpc("reply_wooly_support", { p_request_id: input.data.requestId, p_id: input.data.id, p_body: input.data.body, p_as_support: input.data.asSupport });
    return result.error || !result.data ? failed : { ok: true, data: result.data };
  } catch (error) { return failure(error); }
}

export async function setWoolyRequestStatusAction(id: unknown, status: unknown, asSupport = false): Promise<WoolyActionResult<null>> {
  if (!z.uuid().safeParse(id).success || !z.enum(["open", "closed"]).safeParse(status).success) return invalid;
  try {
    const { client } = asSupport ? await requireWoolySupport() : await requireWoolyAccount("status");
    const result = await client.rpc("set_wooly_support_status", { p_id: id as string, p_status: status as string });
    return result.error ? failed : { ok: true, data: null };
  } catch (error) { return failure(error); }
}

export async function listWoolySupportInboxAction(status: SupportStatus = "open", offset = 0): Promise<WoolyActionResult<{ requests: SupportRequest[]; articles: HelpArticle[] }>> {
  if (!["open", "answered", "closed"].includes(status) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return invalid;
  try {
    const { client } = await requireWoolySupport();
    const [requests, articles] = await Promise.all([
      client.from("wooly_support_requests").select("*").eq("status", status).order("created_at").order("id").range(offset, offset + 99),
      client.from("wooly_help_articles").select("*").order("updated_at", { ascending: false }).limit(200),
    ]);
    return requests.error || articles.error || !requests.data || !articles.data ? failed : { ok: true, data: { requests: requests.data, articles: articles.data } };
  } catch (error) { return failure(error); }
}

export async function saveWoolyHelpArticleAction(value: unknown): Promise<WoolyActionResult<string>> {
  const input = helpArticleSchema.safeParse(value);
  if (!input.success || (input.data.route && !Object.values(woolyPageGuides).some((guide) => !guide.route.includes("[") && guide.route === input.data.route))) return invalid;
  try {
    const { client } = await requireWoolySupport();
    const result = await client.rpc("save_wooly_help_article", {
      p_id: input.data.id, p_title: input.data.title, p_keywords: input.data.keywords,
      p_answer: input.data.answer, p_audience: input.data.audience, p_route: input.data.route, p_published: input.data.published,
    });
    return result.error || !result.data ? failed : { ok: true, data: result.data };
  } catch (error) { return failure(error); }
}
