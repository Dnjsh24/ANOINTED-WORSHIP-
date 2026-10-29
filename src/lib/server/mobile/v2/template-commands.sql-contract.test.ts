// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { mobileTemplateCommandSchema } from '@/lib/mobile/v2/template-commands';
import { assertMobileTemplateResult } from '@/lib/mobile/v2/template-results';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { applyMobileTemplateCommands } from './template-commands';

const casesPath = process.env.MOBILE_TEMPLATE_SQL_CONTRACT_CASES;
// Actual local PostgreSQL export required. Missing execution evidence stays an explicit skip.
describe.skipIf(!casesPath)('actual PostgreSQL template command receipts', () => {
  it('validates every executed outcome through shared and SDK service boundaries', async () => {
    if (!casesPath) throw new Error('Actual PostgreSQL export required.');
    const cases = z.array(z.object({ identity: mobileWorkflowIdentitySchema, command: mobileTemplateCommandSchema, result: z.unknown() }).strict())
      .min(15).parse(JSON.parse(readFileSync(casesPath, 'utf8').replace(/^\uFEFF/, '')));
    const statuses = new Set<string>(); const kinds = new Set<string>();
    for (const entry of cases) {
      const result = assertMobileTemplateResult(entry.command, entry.identity, entry.result);
      statuses.add(result.status); if (result.status === 'applied') kinds.add(result.outcome.kind);
      const client = createClient<Database>('https://actual-template-sql.test', 'synthetic-publishable', {
        auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async () => Response.json([entry.result]) },
      });
      expect(await applyMobileTemplateCommands({ client, identity: entry.identity, request: { version: 2, commands: [entry.command] } }))
        .toEqual({ version: 2, identity: entry.identity, results: [result] });
    }
    expect([...statuses].sort()).toEqual(['applied', 'blocked', 'conflict', 'rejected']);
    expect([...kinds].sort()).toEqual(['created', 'deleted']);
  });
});
