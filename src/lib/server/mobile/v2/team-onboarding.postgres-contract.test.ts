// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { mobileTeamOnboardingSnapshotSchema, assertMobileTeamOnboardingPreview, assertMobileTeamOnboardingResult } from '@/lib/mobile/v2/team-onboarding';
const evidencePath = process.env.MOBILE_TEAM_ONBOARDING_PG_CASES;
it.skipIf(!evidencePath)('validates actual join/cancel/approval states and minimal team preview without granting workspace authority', () => {
  if (!evidencePath) throw new Error('Set MOBILE_TEAM_ONBOARDING_PG_CASES to actual disposable PostgreSQL evidence.');
  const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  const rowSchema = z.object({ id:z.uuid(),team_id:z.uuid(),profile_id:z.uuid(),requested_role:z.string(),status:z.string(),created_at:z.string(),updated_at:z.string(),reviewed_at:z.string().nullable() });
  const rows = ['pending','canceled','rejected','approved'].map(key => {
    const row=rowSchema.parse(raw[key]);return mobileTeamOnboardingSnapshotSchema.parse({id:row.id,teamId:row.team_id,userId:row.profile_id,requestedRole:row.requested_role,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,reviewedAt:row.reviewed_at});
  });
  expect(rows.map(row=>row.status)).toEqual(['pending','canceled','rejected','approved']);
  const pending=rows[0]; const preview=assertMobileTeamOnboardingPreview(pending.userId,'ON-12345',{version:2,userId:pending.userId,code:'ON-12345',team:raw.preview,fetchedAt:new Date().toISOString()});
  expect(Object.keys(preview.team ?? {}).sort()).toEqual(['id','name']);
  const command={version:2 as const,kind:'join' as const,userId:rows[3].userId,requestId:rows[3].id,teamId:rows[3].teamId,code:'ON-12345',requestedRole:rows[3].requestedRole};
  expect(assertMobileTeamOnboardingResult(command.userId,command,{version:2,userId:command.userId,request:command,status:'confirmed',current:rows[3],fetchedAt:new Date().toISOString()}).current?.status).toBe('approved');
});
