// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { mobileMutationResultSchema, mobileRecordSchema } from '@/lib/mobile/contracts';

const casesSchema = z.array(z.discriminatedUnion('kind', [
  z.object({ name: z.string(), kind: z.literal('receipt'), payload: mobileMutationResultSchema }).strict(),
  z.object({ name: z.string(), kind: z.literal('download'), payload: z.object({ manifestId: z.uuid(), records: z.array(mobileRecordSchema), nextCursor: z.unknown() }).strict() }).strict(),
])).min(10);

it('keeps the standalone chart library and deletion snapshots in the forward migration', () => {
  const sql = readFileSync('supabase/migrations/20261021040000_mobile_dance_library.sql', 'utf8');
  expect(sql).toContain("d.team_id=p_team_id and (v_kind='library' or d.song_id in(select id from selected_songs)");
  expect(sql).toContain("v_kind='library' and entity_type in ('song','dance')");
  expect(sql).toContain('private.mobile_can_read_record');
});

it.runIf(Boolean(process.env.MOBILE_DANCE_PG_CASES))('validates actual local PostgreSQL Dance receipts and download pages against runtime SDK contracts', () => {
  const cases = casesSchema.parse(JSON.parse(readFileSync(process.env.MOBILE_DANCE_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  expect(cases.map(item => item.name)).toEqual(expect.arrayContaining(['standalone-create', 'linked-create', 'independent-merge', 'overlap-conflict', 'dancer-create', 'reviewer-delete', 'owner-library', 'member-library', 'library-after-delete']));
  const conflict = cases.find(item => item.name === 'overlap-conflict');
  expect(conflict?.payload).toMatchObject({ status: 'conflict', fields: ['outfit_notes'] });
});
