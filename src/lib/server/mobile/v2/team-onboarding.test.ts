// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileTeamOnboardingCommand } from '@/lib/mobile/v2/team-onboarding';
vi.mock('server-only', () => ({}));
import { applyMobileTeamOnboardingCommand, previewMobileTeamOnboarding, readMobileTeamOnboardingState } from './team-onboarding';
const id = (n: number) => `99920000-0000-4000-8000-${String(n).padStart(12, '0')}`; const userId = id(1); const time = '2026-10-23T04:00:00.123456Z';
const command: MobileTeamOnboardingCommand = { version: 2, kind: 'join', userId, requestId: id(2), teamId: id(3), code: 'AB-12345', requestedRole: 'member' };
const row = { id: id(2), team_id: id(3), profile_id: userId, requested_role: 'member', status: 'pending', created_at: time, updated_at: time, reviewed_at: null };
function setup(results: unknown[]) {
  const queries: { table: string; calls: [string, unknown[]][] }[] = [];
  const from = vi.fn((table: string) => {
    const calls: [string, unknown[]][] = []; queries.push({ table, calls }); const result = { data: results.shift() ?? null, error: null };
    const chain = { then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn(), limit: vi.fn(), insert: vi.fn(), update: vi.fn(), is: vi.fn() };
    for (const method of ['select','eq','order','range','abortSignal','limit','insert','update','is'] as const) chain[method].mockImplementation((...args: unknown[]) => { calls.push([method,args]); return chain; });
    chain.maybeSingle.mockImplementation(() => Promise.resolve(result)); return chain;
  }); return { client: { from } as unknown as SupabaseClient<Database>, from, queries };
}
it('returns minimal actual code/name preview and fully bounded own state independent of membership', async () => {
  const db = setup([{ id: id(3), name: 'Actual team' }]); expect((await previewMobileTeamOnboarding({ ...db, userId, input: { version: 2, userId, code: 'AB-12345' } })).team).toEqual({ id: id(3), name: 'Actual team' });
  expect(db.queries[0].calls).toContainEqual(['select',['id,name']]);
  const state = setup([Array.from({ length: 51 }, (_, i) => ({ ...row, id: id(i + 20) }))]);
  const response = await readMobileTeamOnboardingState({ ...state, userId, offset: 0 }); expect(response.requests).toHaveLength(50); expect(response.hasMore).toBe(true);
  expect(state.queries[0].calls).toContainEqual(['eq',['profile_id',userId]]);
  await expect(readMobileTeamOnboardingState({ ...setup([[{ ...row, profile_id: id(99) }]]), userId, offset: 0 })).rejects.toMatchObject({ status: 403 });
});
it('reconciles exact stable join IDs after approval and returns existing terminal pair honestly without upsert', async () => {
  const exact = setup([{ ...row, status: 'approved', reviewed_at: time }]); expect((await applyMobileTeamOnboardingCommand({ ...exact, userId, command })).current?.status).toBe('approved'); expect(exact.from).toHaveBeenCalledOnce();
  const pair = setup([null, { ...row, id: id(9), status: 'rejected', reviewed_at: time }]); expect((await applyMobileTeamOnboardingCommand({ ...pair, userId, command })).status).toBe('conflict'); expect(pair.from).toHaveBeenCalledTimes(2);
  const inserted = setup([null,null,{ id: id(3),name:'Actual team' },[],[],null,row]); expect((await applyMobileTeamOnboardingCommand({ ...inserted, userId, command })).status).toBe('confirmed');
  expect(inserted.queries[5].calls).toContainEqual(['insert',[{ id: id(2),team_id:id(3),profile_id:userId,requested_role:'member',status:'pending',reviewed_by:null,reviewed_at:null }]]);
  const mismatch = setup([null,null,{ id:id(8),name:'Wrong team' }]); await expect(applyMobileTeamOnboardingCommand({ ...mismatch,userId,command })).rejects.toMatchObject({ status:409 });
});
it('cancels only exact pending CAS, confirms lost replies, and preserves approval races', async () => {
  const base = { id:id(2),teamId:id(3),userId,requestedRole:'member' as const,status:'pending' as const,createdAt:time,updatedAt:time,reviewedAt:null };
  const cancel: MobileTeamOnboardingCommand = { version:2,kind:'cancel',userId,base };
  const approved = { ...row,status:'approved',reviewed_at:time };
  const race = setup([row,null,approved]); expect((await applyMobileTeamOnboardingCommand({ ...race,userId,command:cancel })).status).toBe('conflict');
  expect(race.queries[1].calls).toContainEqual(['eq',['status','pending']]); expect(race.queries[1].calls).toContainEqual(['eq',['updated_at',time]]);
  expect(race.queries[1].calls).toContainEqual(['update',[{ status:'canceled',reviewed_by:null,reviewed_at:null }]]);
  const replay=setup([{ ...row,status:'canceled' }]); expect((await applyMobileTeamOnboardingCommand({ ...replay,userId,command:cancel })).status).toBe('confirmed'); expect(replay.from).toHaveBeenCalledOnce();
});
