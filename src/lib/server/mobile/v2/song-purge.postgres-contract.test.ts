// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { mobileSongPurgeRequestSchema, mobileSongPurgeReceiptSchema, assertMobileSongPurgeReceipt } from '@/lib/mobile/v2/song-purge';
import { songPurgeIdentity } from '@/lib/mobile/v2/song-purge-test-fixture';
const path = process.env.MOBILE_SONG_PURGE_PG_CASES;
it.skipIf(!path)('validates actual SQL purge receipts, microsecond bases and concurrent immutable replay', () => {
 if (!path) throw new Error('Actual isolated PostgreSQL evidence required.');
 const rows = z.array(z.object({ request: mobileSongPurgeRequestSchema, receipt: mobileSongPurgeReceiptSchema }).strict()).parse(JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')));
 expect(rows).toHaveLength(14);
 expect(rows.filter(row => row.receipt.status === 'applied')).toHaveLength(4);
 expect(rows.filter(row => row.receipt.status === 'conflict')).toHaveLength(7);
 expect(rows.filter(row => row.receipt.status === 'missing')).toHaveLength(1);
 expect(rows.filter(row => row.receipt.status === 'related-records-blocked')).toHaveLength(2);
 for (const { request, receipt } of rows) expect(assertMobileSongPurgeReceipt({ ...songPurgeIdentity, userId: request.userId, teamId: request.teamId, memberId: request.memberId }, request, receipt)).toEqual(receipt);
});
