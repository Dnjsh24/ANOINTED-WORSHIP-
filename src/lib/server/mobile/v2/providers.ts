import 'server-only';
import { MobileApiError } from '@/lib/mobile/errors';
import { importSongRequest } from '@/lib/server/song-import';
import { getSpotifyAccessToken, parseSpotifySearchQuery, searchSpotifyTracks } from '@/lib/server/spotify';

export async function importMobileSong(request: Request) {
  const response = await importSongRequest(request);
  if (response.ok) return response;
  const body: unknown = await response.json();
  const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Song import failed.';
  throw new MobileApiError(response.status, 'provider', message);
}
export async function searchMobileSpotify(request: Request) {
  let query: string;
  try { query = parseSpotifySearchQuery(new URL(request.url).searchParams.get('q')); }
  catch { throw new MobileApiError(400, 'query', 'Enter a valid Spotify search.'); }
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new MobileApiError(503, 'provider', 'Spotify search is not configured.');
  try { return Response.json(await searchSpotifyTracks(query, await getSpotifyAccessToken(id, secret))); }
  catch { throw new MobileApiError(503, 'provider', 'Spotify search is temporarily unavailable.'); }
}
