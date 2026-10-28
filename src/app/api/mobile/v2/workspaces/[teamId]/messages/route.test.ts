// @vitest-environment node
import { expect,it,vi } from 'vitest';
import { profileAvatarIdentity as identity } from '@/lib/mobile/v2/profile-avatar-test-fixture';
const mocks=vi.hoisted(()=>({context:vi.fn(),channels:vi.fn(),thread:vi.fn()}));vi.mock('server-only',()=>({}));
vi.mock('@/lib/server/mobile/v2/context',async importOriginal=>({...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(),requireSelectedWorkspace:mocks.context}));
vi.mock('@/lib/server/mobile/v2/messages',()=>({readMobileMessageChannels:mocks.channels,readMobileMessageThread:mocks.thread}));
import { GET as channels } from './channels/route';import { GET as thread } from './channels/[channelId]/route';
it('requires selected workspace and exact cursor query keys without arbitrary channel access flags',async()=>{
  mocks.context.mockResolvedValue({client:{},identity});mocks.channels.mockResolvedValue({version:2});mocks.thread.mockResolvedValue({version:2});
  const channelId='99940000-0000-4000-8000-000000000001';const context={params:Promise.resolve({teamId:identity.teamId,channelId})};
  expect((await channels(new Request('https://example.test'),context)).status).toBe(200);
  expect((await channels(new Request(`https://example.test?after=${channelId}&after=${channelId}`),context)).status).toBe(400);
  for(const query of ['?asAdmin=true',`?beforeId=${channelId}`])expect((await thread(new Request(`https://example.test${query}`),context)).status).toBe(400);
  expect(mocks.thread).not.toHaveBeenCalled();
});
