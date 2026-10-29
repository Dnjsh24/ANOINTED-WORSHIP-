// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { liveStageRequestSchema, liveStageResponseSchema } from '@/lib/domain/live-stage';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { applyLiveStageRequest } from './live-stage';
const casesPath = process.env.LIVE_STAGE_SQL_CONTRACT_CASES;
describe.skipIf(!casesPath)('executed local PostgreSQL live Stage responses', () => {
  it('validates captured claims, cursor updates, heartbeat, releases and inactive reads through the shared SDK boundary', async () => {
    if (!casesPath) throw new Error('Executed PostgreSQL export required.');
    const cases = z.array(z.object({ identity: mobileWorkflowIdentitySchema, setlistId: z.uuid(), request: liveStageRequestSchema, response: liveStageResponseSchema }).strict())
      .min(20).parse(JSON.parse(readFileSync(casesPath, 'utf8').replace(/^\uFEFF/, '')));
    const actions = new Set<string>();
    for (const entry of cases) {
      actions.add(entry.request.action);
      const client = createClient<Database>('https://executed-live-stage.test', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async () => Response.json(entry.response) } });
      expect(await applyLiveStageRequest({ client, identity: entry.identity, setlistId: entry.setlistId, request: entry.request })).toEqual(entry.response);
    }
    expect([...actions].sort()).toEqual(['claim', 'heartbeat', 'publish', 'read', 'release']);
  });
});
