// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { mobileSupportRequestSchema } from '@/lib/mobile/v2/support-requests';
import { mobileSupportMessageSchema } from '@/lib/mobile/v2/support-request-detail';
import { assertMobileSupportRequestConfirmation } from '@/lib/mobile/v2/support-request-commands';
const evidencePath = process.env.MOBILE_SUPPORT_REQUEST_COMMAND_PG_CASES;
it.skipIf(!evidencePath)('validates actual existing-RPC request/message rows as exact row-backed confirmations', () => {
  if (!evidencePath) throw new Error('Set MOBILE_SUPPORT_REQUEST_COMMAND_PG_CASES to actual PostgreSQL evidence.');
  const evidence = z.object({ created: mobileSupportRequestSchema, message: mobileSupportMessageSchema }).strict().parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  const row = evidence.created; const message = evidence.message;
  const create = { version: 2 as const, kind: 'create' as const, userId: row.profile_id, requestId: row.id, teamId: row.team_id, question: row.question, details: row.details, pagePath: row.page_path };
  const reply = { version: 2 as const, kind: 'reply' as const, userId: row.profile_id, requestId: row.id, messageId: message.id, body: message.body };
  for (const [intent, id, createdAt] of [[create, row.id, row.created_at], [reply, message.id, message.created_at]] as const)
    expect(assertMobileSupportRequestConfirmation(row.profile_id, intent, { version: 2, intent, status: 'confirmed', record: { id, createdAt } }).record).toEqual({ id, createdAt });
  expect(message.request_id).toBe(row.id); expect(message.author_id).toBe(row.profile_id); expect(message.author_kind).toBe('requester');
});
