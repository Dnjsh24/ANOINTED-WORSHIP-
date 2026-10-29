import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ html: vi.fn(), token: vi.fn(), search: vi.fn() }));
vi.mock('@/lib/server/song-import', () => ({ importSongRequest: mocks.html }));
vi.mock('@/lib/server/spotify', () => ({ parseSpotifySearchQuery: (q: string) => { if (!q) throw new Error('Empty'); return q; }, getSpotifyAccessToken: mocks.token, searchSpotifyTracks: mocks.search }));
import { importMobileSong, searchMobileSpotify } from './providers';
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('SPOTIFY_CLIENT_ID', 'fixture-id'); vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'fixture-secret'); mocks.token.mockResolvedValue('provider-token'); mocks.search.mockResolvedValue([]); });
it('reuses the website import service and converts failures to the versioned API boundary', async () => {
  mocks.html.mockResolvedValue(Response.json({ lyrics: '[C]Song' }));
  const request = new Request('https://website.test/api/mobile/v2/providers/song-import', { method: 'POST' });
  expect(await (await importMobileSong(request)).json()).toEqual({ lyrics: '[C]Song' }); expect(mocks.html).toHaveBeenCalledWith(request);
  mocks.html.mockResolvedValue(Response.json({ error: 'URL is not allowed' }, { status: 400 }));
  await expect(importMobileSong(request)).rejects.toMatchObject({ status: 400, code: 'provider', message: 'URL is not allowed' });
});
it('uses existing Spotify services and hides provider secrets/errors', async () => {
  expect(await (await searchMobileSpotify(new Request('https://website.test/?q=Grace'))).json()).toEqual([]);
  expect(mocks.search).toHaveBeenCalledWith('Grace', 'provider-token');
  mocks.token.mockRejectedValue(new Error('private token response'));
  await expect(searchMobileSpotify(new Request('https://website.test/?q=Grace'))).rejects.toMatchObject({ status: 503, message: 'Spotify search is temporarily unavailable.' });
  await expect(searchMobileSpotify(new Request('https://website.test/'))).rejects.toMatchObject({ status: 400 });
});
