// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { mobileRehearsalCommandSchema, assertMobileRehearsalResult, assertRehearsalCommandScope } from '@/lib/mobile/v2/rehearsal-commands';
import { applyMobileRehearsalCommands } from './rehearsal';
const casesPath = process.env.MOBILE_REHEARSAL_SQL_CONTRACT_CASES;
describe.skipIf(!casesPath)('executed local PostgreSQL rehearsal receipts', () => {
  it('validates every SQL outcome through the contracts and SDK handler', async () => {
    if (!casesPath) throw new Error('Actual PostgreSQL export required.');
    const cases = z.array(z.object({ identity: mobileWorkflowIdentitySchema, command: mobileRehearsalCommandSchema, result: z.unknown() }).strict())
      .min(21).parse(JSON.parse(readFileSync(casesPath, 'utf8').replace(/^\uFEFF/, '')));
    const statuses = new Set<string>(); const operations = new Set<string>();
    for (const entry of cases) {
      const result = assertMobileRehearsalResult(entry.command, entry.identity, entry.result);
      statuses.add(result.status); operations.add(result.type);
      const client = createClient<Database>('https://executed-rehearsal.test', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async () => Response.json([entry.result]) } });
      const identity = { ...entry.identity, teamName: 'SQL fixture', role: 'owner' as const, permissions: [] };
      // The direct SQL negative fixture deliberately changes a task key while retaining another task's base.
      // The public API must reject that mismatched base before dispatch, even though SQL also denied the write.
      let validScope = true;
      try { assertRehearsalCommandScope(entry.command, identity); } catch { validScope = false; }
      if (!validScope) {
        expect(result.status).toBe('rejected');
        await expect(applyMobileRehearsalCommands({ client, identity, request: { version: 2, commands: [entry.command] } })).rejects.toMatchObject({ status: 400 });
        continue;
      }
      expect((await applyMobileRehearsalCommands({ client, identity, request: { version: 2, commands: [entry.command] } })).results).toEqual([result]);
    }
    expect([...statuses].sort()).toEqual(['applied', 'blocked', 'conflict', 'rejected']);
    expect([...operations].sort()).toEqual(['rehearsal.plan.request', 'rehearsal.plan.save', 'rehearsal.readiness.respond', 'rehearsal.task.respond']);
  });
});
