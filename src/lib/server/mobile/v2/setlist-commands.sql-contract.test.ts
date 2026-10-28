// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { mobileSetlistCommandSchema } from '@/lib/mobile/v2/setlist-commands';
import { assertMobileSetlistResult, mobileSetlistDeleteReviewSchema } from '@/lib/mobile/v2/setlist-results';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { applyMobileSetlistCommands, readMobileSetlistDeleteScope } from './setlist-commands';

// A missing actual PostgreSQL export is a skip, never synthetic database evidence.
const casesPath = process.env.MOBILE_SETLIST_SQL_CONTRACT_CASES;
const reviewsPath = process.env.MOBILE_SETLIST_SQL_DELETE_REVIEWS;
function readExport(path: string) { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); }
function client(data: unknown) {
  return createClient<Database>('https://setlist-sql-contract.test', 'synthetic-publishable', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async () => Response.json(data) },
  });
}
describe.skipIf(!casesPath)('actual PostgreSQL setlist operation confirmations', () => {
  it('accepts every executed SQL outcome through the shared and real SDK/API validators', async () => {
    const cases = z.array(z.object({ identity: mobileWorkflowIdentitySchema, command: mobileSetlistCommandSchema, result: z.unknown() }).strict()).min(18).parse(readExport(casesPath!));
    const statuses = new Set<string>(); const kinds = new Set<string>();
    for (const entry of cases) {
      const result = assertMobileSetlistResult(entry.command, entry.identity, entry.result);
      statuses.add(result.status); if (result.status === 'applied') kinds.add(result.outcome.kind);
      expect(await applyMobileSetlistCommands({ client: client([entry.result]), identity: entry.identity, request: { version: 2, commands: [entry.command] } }))
        .toEqual({ version: 2, identity: entry.identity, results: [result] });
    }
    expect([...statuses].sort()).toEqual(['applied', 'blocked', 'conflict', 'rejected']); expect([...kinds].sort()).toEqual(['deleted', 'saved']);
  });
});
describe.skipIf(!reviewsPath)('actual PostgreSQL deletion review snapshots', () => {
  it('accepts complete linked and standalone reviews including soft-deleted siblings', async () => {
    const reviews = z.array(z.object({ identity: mobileWorkflowIdentitySchema, setlistId: z.uuid(), review: mobileSetlistDeleteReviewSchema }).strict()).min(2).parse(readExport(reviewsPath!));
    expect(reviews.some(entry => entry.review.siblings.some(sibling => sibling.record.deleted_at !== null))).toBe(true);
    expect(reviews.some(entry => entry.review.snapshot.record.event_id === null)).toBe(true);
    for (const entry of reviews) expect(await readMobileSetlistDeleteScope({ client: client(entry.review), identity: entry.identity, setlistId: entry.setlistId }))
      .toEqual({ version: 2, identity: entry.identity, review: entry.review });
  });
});
