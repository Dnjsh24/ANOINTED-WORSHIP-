// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { mobilePreflight } from './http';

it('allows the app scope headers on native origins and rejects foreign origins', async () => {
  const response = await mobilePreflight(new Request('https://example.test/api/mobile/v1/bootstrap', {
    headers: {
      origin: 'capacitor://localhost',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization,x-mobile-user-id,x-mobile-team-id,x-mobile-member-id',
    },
  }));

  expect(response.status).toBe(204);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
  expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(/,\s*/)).toEqual(
    expect.arrayContaining(['authorization', 'x-mobile-user-id', 'x-mobile-team-id', 'x-mobile-member-id']),
  );

  const denied = await mobilePreflight(new Request('https://example.test/api/mobile/v1/bootstrap', {
    headers: { origin: 'https://foreign.example' },
  }));
  expect(denied.status).toBe(403);
  expect(denied.headers.has('Access-Control-Allow-Origin')).toBe(false);
});
