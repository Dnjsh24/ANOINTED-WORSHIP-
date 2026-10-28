// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { mobileServiceCommandSchema } from '@/lib/mobile/v2/service-commands';
import { assertMobileServiceResult } from '@/lib/mobile/v2/service-results';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { applyMobileServiceCommands } from './service-commands';

// Run only with an actual export from our disposable local PostgreSQL runner.
// A synthetic fixture or a missing database run must not count as SQL evidence.
const exportedCasesPath = process.env.MOBILE_SERVICE_SQL_CONTRACT_CASES;
describe.skipIf(!exportedCasesPath)('actual PostgreSQL service command confirmations', () => {
  it('passes every executed SQL outcome through the real mobile API contract', async () => {
    const cases = z.array(z.object({ identity: mobileWorkflowIdentitySchema, command: mobileServiceCommandSchema, result: z.unknown() }).strict())
      .min(15).parse(JSON.parse(readFileSync(exportedCasesPath!, 'utf8').replace(/^\uFEFF/, '')));
    const statuses = new Set<string>(); const outcomes = new Set<string>();
    for (const entry of cases) {
      const result = assertMobileServiceResult(entry.command, entry.identity, entry.result);
      statuses.add(result.status); if (result.status === 'applied') outcomes.add(result.outcome.kind);
      const client = createClient<Database>('https://service-sql-contract.test', 'synthetic-public-key', {
        auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async () => Response.json([entry.result]) },
      });
      expect(await applyMobileServiceCommands({ client, identity: entry.identity, request: { version: 2, commands: [entry.command] } }))
        .toEqual({ version: 2, identity: entry.identity, results: [result] });
    }
    expect([...statuses].sort()).toEqual(['applied', 'blocked', 'conflict', 'rejected']);
    expect([...outcomes].sort()).toEqual(['assignment', 'order', 'request']);
  });
});
