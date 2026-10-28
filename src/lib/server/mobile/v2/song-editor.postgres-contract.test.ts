// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { mobileSongEditorContextSchema, assertMobileSongEditorBase } from '@/lib/mobile/v2/song-editor';
import { mobileSongProposalRequestSchema, mobileSongProposalReceiptSchema, assertMobileSongProposalReceipt } from '@/lib/mobile/v2/song-proposals';
const path = process.env.MOBILE_SONG_EDITOR_PG_CASES;
it.skipIf(!path)('validates actual SQL self-RLS creator/override contexts and existing shared-request exact/concurrent receipts', () => {
 if (!path) throw new Error('Actual retained PostgreSQL127 evidence required.');
 const result = z.object({ editors: z.array(mobileSongEditorContextSchema), proposals: z.array(z.object({ request: mobileSongProposalRequestSchema, receipt: mobileSongProposalReceiptSchema }).strict()) }).strict().parse(JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')));
 expect(result.editors).toHaveLength(7); expect(result.editors.filter(row => row.authorization.direct)).toHaveLength(4);
 expect(result.editors.filter(row => row.authorization.editOverride === false)).toHaveLength(2); expect(result.editors.filter(row => row.authorization.editOverride === true)).toHaveLength(1);
 expect(result.editors.some(row => row.song.createdBy === row.identity.userId && row.authorization.direct && !row.identity.permissions.includes('songs.edit') && row.authorization.editOverride === null)).toBe(true);
 for (const row of result.editors) expect(assertMobileSongEditorBase(row.identity, { entityType: 'song', id: row.song.id, revision: row.song.revision, value: row.song.value }, row)).toEqual(row);
 expect(result.proposals).toHaveLength(5); expect(result.proposals.filter(row => row.receipt.request.status === 'pending')).toHaveLength(4); expect(result.proposals.filter(row => row.receipt.request.status === 'needs_revision')).toHaveLength(1);
 for (const row of result.proposals) {
  const identity = result.editors.find(editor => editor.identity.userId === row.request.intent.userId)!.identity;
  expect(assertMobileSongProposalReceipt(identity, row.request.intent.proposal.targetId, row.request, row.receipt)).toEqual(row.receipt);
 }
});
