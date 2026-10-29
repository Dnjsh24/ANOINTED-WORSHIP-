// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { assertMobileSetlistCreateReview, mobileSetlistCreateReviewRequestSchema } from '@/lib/mobile/v2/setlist-create-review';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { readMobileSetlistCreateReview } from './setlist-create-review';

const casesPath = process.env.MOBILE_SETLIST_SQL_CREATE_REVIEWS;
// Missing actual PostgreSQL output is a skip, never synthetic execution evidence.
describe.skipIf(!casesPath)('actual PostgreSQL fresh terminal-create reviews', () => {
  it('validates every executed review through the shared contract and actual SDK service boundary', async () => {
    if (!casesPath) throw new Error('Actual PostgreSQL export required.');
    const cases = z.array(z.object({ identity: mobileWorkflowIdentitySchema,
      request: mobileSetlistCreateReviewRequestSchema, response: z.unknown() }).strict()).min(5)
      .parse(JSON.parse(readFileSync(casesPath, 'utf8').replace(/^\uFEFF/, '')));
    const statuses = new Set<string>();
    for (const entry of cases) {
      const response = assertMobileSetlistCreateReview(entry.request, entry.identity, entry.response);
      statuses.add(response.receipt.status);
      const client = createClient<Database>('https://actual-sql-create-review.test', 'synthetic-publishable', {
        auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async () => Response.json(entry.response) },
      });
      expect(await readMobileSetlistCreateReview({ client, identity: entry.identity, request: entry.request })).toEqual(response);
    }
    expect([...statuses].sort()).toEqual(['blocked', 'conflict', 'rejected']);
  });
});
