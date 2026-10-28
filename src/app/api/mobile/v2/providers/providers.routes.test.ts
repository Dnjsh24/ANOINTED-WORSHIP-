// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),import:vi.fn(),search:vi.fn()}));
vi.mock('@/lib/server/mobile/v2/context',async original=>({...await original<typeof import('@/lib/server/mobile/v2/context')>(),requireMobileUser:mocks.user}));
vi.mock('@/lib/server/mobile/v2/providers',()=>({importMobileSong:mocks.import,searchMobileSpotify:mocks.search}));
import {POST as importSong, OPTIONS} from './song-import/route';
import {GET as search} from './spotify/route';
import {MobileApiError} from '@/lib/mobile/errors';
beforeEach(()=>{vi.clearAllMocks();mocks.user.mockResolvedValue({userId:'verified'});mocks.import.mockImplementation(async()=>Response.json({lyrics:'[C]Song'}));mocks.search.mockImplementation(async()=>Response.json([]));});
it('authenticates before invoking either provider and preserves native CORS/no-store boundaries',async()=>{
  const request=new Request('https://website.test/api/mobile/v2/providers/song-import',{method:'POST',headers:{origin:'https://localhost'}});
  const response=await importSong(request);
  expect(response.status).toBe(200);expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
  expect(response.headers.get('Cache-Control')).toContain('no-store');expect(mocks.user).toHaveBeenCalledWith(request);expect(mocks.import).toHaveBeenCalledWith(request);
  mocks.user.mockRejectedValue(new MobileApiError(401,'session','Expired'));
  const denied=await search(new Request('https://website.test/api/mobile/v2/providers/spotify?q=Song'));
  expect(denied.status).toBe(401);expect(await denied.json()).toEqual({version:2,error:{code:'session',message:'Expired'}});expect(mocks.search).not.toHaveBeenCalled();
});
it('rejects foreign browser origins before authentication and accepts installed-app preflight without credentials',async()=>{
  const response=await importSong(new Request('https://website.test/api/mobile/v2/providers/song-import',{method:'POST',headers:{origin:'https://evil.test'}}));
  expect(response.status).toBe(403);expect(mocks.user).not.toHaveBeenCalled();expect(mocks.import).not.toHaveBeenCalled();
  const preflight=await OPTIONS(new Request('https://website.test/api/mobile/v2/providers/song-import',{method:'OPTIONS',headers:{origin:'capacitor://localhost'}}));
  expect(preflight.status).toBe(204);expect(mocks.user).not.toHaveBeenCalled();
});
