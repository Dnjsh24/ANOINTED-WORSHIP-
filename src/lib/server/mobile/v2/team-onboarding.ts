import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileTeamOnboardingSnapshotSchema, mobileTeamOnboardingCommandSchema, mobileTeamOnboardingPreviewRequestSchema, assertMobileTeamOnboardingState,
  assertMobileTeamOnboardingPreview, assertMobileTeamOnboardingResult, type MobileTeamOnboardingCommand, type MobileTeamOnboardingSnapshot } from '@/lib/mobile/v2/team-onboarding';
import { MobileApiError } from '../context';
type Context = { client: SupabaseClient<Database>; userId: string; signal?: AbortSignal };
const fields = 'id,team_id,profile_id,requested_role,status,created_at,updated_at,reviewed_at';
const rowSchema = z.object({ id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), requested_role: z.string(), status: z.string(), created_at: z.string(), updated_at: z.string(), reviewed_at: z.string().nullable() }).strict();
const unavailable = () => new MobileApiError(503, 'team_onboarding_unconfirmed', 'This request could not be confirmed. Keep its original details and retry when connected.');
const denied = () => new MobileApiError(403, 'team_onboarding_account', 'Verify the original account before continuing this team request.');
function snapshot(value: unknown, userId: string): MobileTeamOnboardingSnapshot {
  const row = rowSchema.parse(value); if (row.profile_id !== userId) throw denied();
  return mobileTeamOnboardingSnapshotSchema.parse({ id: row.id, teamId: row.team_id, userId: row.profile_id, requestedRole: row.requested_role, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at });
}
function own(context: Context, userId: string) { z.uuid().parse(context.userId); if (context.userId !== userId) throw denied(); context.signal?.throwIfAborted(); }
export async function readMobileTeamOnboardingState(context: Context & { offset: number }) {
  own(context, context.userId); const offset = z.number().int().min(0).max(1_000_000).parse(context.offset);
  const query = context.client.from('join_requests').select(fields).eq('profile_id', context.userId).order('created_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + 50);
  const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted(); if (result.error) throw unavailable();
  try { const rows = z.array(rowSchema).max(51).parse(result.data); return assertMobileTeamOnboardingState(context.userId, offset, { version: 2, userId: context.userId,
    requests: rows.slice(0, 50).map(row => snapshot(row, context.userId)), offset, hasMore: rows.length > 50, fetchedAt: new Date().toISOString() }); } catch (error) { if (error instanceof MobileApiError) throw error; throw unavailable(); }
}
export async function previewMobileTeamOnboarding(context: Context & { input: unknown }) {
  const input = mobileTeamOnboardingPreviewRequestSchema.parse(context.input); own(context, input.userId);
  const query = context.client.from('teams').select('id,name').eq('code', input.code);
  const result = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); context.signal?.throwIfAborted(); if (result.error) throw unavailable();
  try { return assertMobileTeamOnboardingPreview(context.userId, input.code, { ...input, team: result.data, fetchedAt: new Date().toISOString() }); } catch { throw unavailable(); }
}
async function findOwn(context: Context, target: { id: string } | { teamId: string }) {
  let query = context.client.from('join_requests').select(fields).eq('profile_id', context.userId);
  query = 'id' in target ? query.eq('id', target.id) : query.eq('team_id', target.teamId);
  const result = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); context.signal?.throwIfAborted(); if (result.error) throw unavailable();
  if (result.data === null) return null; try { return snapshot(result.data, context.userId); } catch (error) { if (error instanceof MobileApiError) throw error; throw unavailable(); }
}
export async function applyMobileTeamOnboardingCommand(context: Context & { command: MobileTeamOnboardingCommand }) {
  const command = mobileTeamOnboardingCommandSchema.parse(context.command); own(context, command.userId);
  const result = (status: 'confirmed' | 'conflict' | 'missing', current: MobileTeamOnboardingSnapshot | null) => assertMobileTeamOnboardingResult(context.userId, command,
    { version: 2, userId: context.userId, request: command, status, current, fetchedAt: new Date().toISOString() });
  if (command.kind === 'cancel') {
    let current = await findOwn(context, { id: command.base.id }); if (!current) return result('missing', null);
    const alreadyCanceled = () => current?.status === 'canceled' && current.teamId === command.base.teamId && current.requestedRole === command.base.requestedRole && current.createdAt === command.base.createdAt && current.reviewedAt === null;
    if (alreadyCanceled()) return result('confirmed', current);
    if (JSON.stringify(current) !== JSON.stringify(command.base)) return result('conflict', current);
    let query = context.client.from('join_requests').update({ status: 'canceled', reviewed_by: null, reviewed_at: null }).eq('profile_id', context.userId).eq('id', command.base.id)
      .eq('team_id', command.base.teamId).eq('requested_role', command.base.requestedRole).eq('status', 'pending').eq('created_at', command.base.createdAt).eq('updated_at', command.base.updatedAt);
    query = command.base.reviewedAt === null ? query.is('reviewed_at', null) : query.eq('reviewed_at', command.base.reviewedAt);
    await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
    current = await findOwn(context, { id: command.base.id }); if (!current) return result('missing', null);
    if (alreadyCanceled()) return result('confirmed', current); if (JSON.stringify(current) !== JSON.stringify(command.base)) return result('conflict', current); throw unavailable();
  }
  let current = await findOwn(context, { id: command.requestId });
  if (current) { if (current.teamId !== command.teamId) throw new MobileApiError(409, 'team_onboarding_identity', 'This request ID belongs to another team. Keep the original request.'); return result(current.requestedRole === command.requestedRole ? 'confirmed' : 'conflict', current); }
  current = await findOwn(context, { teamId: command.teamId }); if (current) return result('conflict', current);
  const preview = await previewMobileTeamOnboarding({ ...context, input: { version: 2, userId: context.userId, code: command.code } });
  if (!preview.team || preview.team.id !== command.teamId) throw new MobileApiError(409, 'team_onboarding_code', 'The team code no longer matches the reviewed team. Review it again.');
  const membershipQuery = context.client.from('team_members').select('id').eq('profile_id', context.userId).eq('status', 'active').limit(1);
  const membership = await (context.signal ? membershipQuery.abortSignal(context.signal) : membershipQuery); context.signal?.throwIfAborted();
  if (membership.error || !Array.isArray(membership.data)) throw unavailable();
  if (membership.data.length) throw new MobileApiError(409, 'team_onboarding_active', 'An active team is already available. Refresh your workspaces to open it.');
  const pendingQuery = context.client.from('join_requests').select('id').eq('profile_id', context.userId).eq('status', 'pending').limit(1);
  const pending = await (context.signal ? pendingQuery.abortSignal(context.signal) : pendingQuery); context.signal?.throwIfAborted();
  if (pending.error || !Array.isArray(pending.data)) throw unavailable(); if (pending.data.length) throw new MobileApiError(409, 'team_onboarding_pending', 'Review your existing pending request before requesting another team.');
  const insert = context.client.from('join_requests').insert({ id: command.requestId, team_id: command.teamId, profile_id: context.userId, requested_role: command.requestedRole, status: 'pending', reviewed_by: null, reviewed_at: null });
  await (context.signal ? insert.abortSignal(context.signal) : insert); context.signal?.throwIfAborted();
  current = await findOwn(context, { id: command.requestId });
  if (current) return result(current.requestedRole === command.requestedRole ? 'confirmed' : 'conflict', current);
  current = await findOwn(context, { teamId: command.teamId }); if (current) return result('conflict', current); throw unavailable();
}
