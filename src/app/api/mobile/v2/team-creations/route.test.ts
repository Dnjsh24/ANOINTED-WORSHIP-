// @vitest-environment node
import { expect,it,vi } from 'vitest';
import { teamCreationRequest as input } from '@/lib/mobile/v2/team-creation-test-fixture';
const mocks=vi.hoisted(()=>({user:vi.fn(),apply:vi.fn()}));vi.mock('server-only',()=>({}));
vi.mock('@/lib/server/mobile/v2/context',async importOriginal=>({...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(),requireMobileUser:mocks.user}));
vi.mock('@/lib/server/mobile/v2/team-creation',()=>({applyMobileTeamCreation:mocks.apply}));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST } from './route';
it('uses account-only authentication and bounded exact creation fields',async()=>{
  mocks.user.mockResolvedValue({client:{},userId:input.userId});mocks.apply.mockResolvedValue({version:2});const request=(body:string)=>new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body});
  expect((await POST(request(JSON.stringify(input)))).status).toBe(200);expect((await POST(request(JSON.stringify({...input,role:'owner'})))).status).toBe(400);expect((await POST(request(' '.repeat(8193)))).status).toBe(413);
  mocks.user.mockRejectedValueOnce(new MobileApiError(401,'session','Sign in.'));expect((await POST(request(JSON.stringify(input)))).status).toBe(401);expect(mocks.apply).toHaveBeenCalledOnce();
});
