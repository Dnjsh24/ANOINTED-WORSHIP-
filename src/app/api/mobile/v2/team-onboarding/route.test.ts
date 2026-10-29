// @vitest-environment node
import { expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({ user:vi.fn(),state:vi.fn(),preview:vi.fn(),command:vi.fn() }));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/server/mobile/v2/context',async importOriginal=>({...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(),requireMobileUser:mocks.user}));
vi.mock('@/lib/server/mobile/v2/team-onboarding',()=>({readMobileTeamOnboardingState:mocks.state,previewMobileTeamOnboarding:mocks.preview,applyMobileTeamOnboardingCommand:mocks.command}));
import { GET } from './state/route';
import { POST as preview } from './preview/route';
import { POST as command } from './commands/route';
import { MobileApiError } from '@/lib/server/mobile/context';
it('uses account authentication only and strict bounded state/preview/command inputs',async()=>{
  const userId='99920000-0000-4000-8000-000000000001'; mocks.user.mockResolvedValue({client:{},userId}); mocks.state.mockResolvedValue({version:2}); mocks.preview.mockResolvedValue({version:2}); mocks.command.mockResolvedValue({version:2});
  const request=(body:unknown)=>new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  expect((await GET(new Request('https://example.test'))).status).toBe(200); expect((await GET(new Request('https://example.test?offset=0&offset=1'))).status).toBe(400);
  expect((await preview(request({version:2,userId,code:'AB-12345'}))).status).toBe(200);
  expect((await command(request({version:2,kind:'join',userId,requestId:userId,teamId:userId,code:'AB-12345',requestedRole:'owner'}))).status).toBe(400);
  mocks.user.mockRejectedValueOnce(new MobileApiError(401,'session','Sign in.'));expect((await GET(new Request('https://example.test'))).status).toBe(401);
});
