// @vitest-environment node
import { expect,it,vi } from 'vitest';
import { messageSendIdentity as identity,messageSendRequest as input,messageSendResponse } from '@/lib/mobile/v2/message-send-test-fixture';
const mocks=vi.hoisted(()=>({context:vi.fn(),apply:vi.fn(),state:vi.fn()}));vi.mock('server-only',()=>({}));
vi.mock('@/lib/server/mobile/v2/context',async original=>({...await original<typeof import('@/lib/server/mobile/v2/context')>(),requireSelectedWorkspace:mocks.context}));
vi.mock('@/lib/server/mobile/v2/message-send',()=>({applyMobileMessageSend:mocks.apply,readMobileMessageSendState:mocks.state}));
import { POST } from './route';import { GET } from './state/route';
it('pins selected channel and rejects extra body/state fields before sending',async()=>{mocks.context.mockResolvedValue({client:{},identity});mocks.apply.mockResolvedValue(messageSendResponse);mocks.state.mockResolvedValue({version:2});const context={params:Promise.resolve({teamId:identity.teamId,channelId:input.channelId})};const request=(body:unknown)=>new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});expect((await POST(request(input),context)).status).toBe(200);expect((await POST(request({...input,schedule:'later'}),context)).status).toBe(400);expect((await POST(request({...input,channelId:input.requestNonce}),context)).status).toBe(403);expect(mocks.apply).toHaveBeenCalledOnce();expect((await GET(new Request('https://example.test?asAdmin=true'),context)).status).toBe(400);expect(mocks.state).not.toHaveBeenCalled();});
