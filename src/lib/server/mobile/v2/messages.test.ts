// @vitest-environment node
import { beforeEach,expect,it,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { profileAvatarIdentity as identity } from '@/lib/mobile/v2/profile-avatar-test-fixture';
const mocks=vi.hoisted(()=>({selected:vi.fn()}));vi.mock('server-only',()=>({}));vi.mock('@/lib/mobile/v2/read-workspaces',()=>({readSelectedWorkspace:mocks.selected}));
vi.mock('./direct-peer-labels',()=>({enrichDirectPeerLabels:async(_context:unknown,channels:unknown[])=>channels}));
import { readMobileMessageChannels,readMobileMessageThread } from './messages';
const id=(n:number)=>`99940000-0000-4000-8000-${String(n).padStart(12,'0')}`;const time='2026-10-23T04:00:00.123456Z';
const channel={id:id(1),team_id:identity.teamId,name:'Private chat',channel_type:'direct',updated_at:time,own:[{team_member_id:identity.memberId}]};
function setup(results:unknown[]){const calls:{table:string;methods:[string,unknown[]][]}[]=[];const from=vi.fn((table:string)=>{const methods:[string,unknown[]][]=[];calls.push({table,methods});const result={data:results.shift()??null,error:null};
  const query={then:<T>(resolve:(value:typeof result)=>T)=>Promise.resolve(result).then(resolve),select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),gt:vi.fn(),in:vi.fn(),or:vi.fn(),abortSignal:vi.fn(),maybeSingle:vi.fn(async()=>result)};
  for(const name of ['select','eq','order','limit','gt','in','or','abortSignal'] as const)query[name].mockImplementation((...args:unknown[])=>{methods.push([name,args]);return query;});return query;});return{client:{from} as unknown as SupabaseClient<Database>,from,calls};}
beforeEach(()=>{mocks.selected.mockReset();mocks.selected.mockResolvedValue(identity);});
it('lists only own joined team channels and hides a channel removed during the read',async()=>{
  const db=setup([[channel],[channel]]);expect((await readMobileMessageChannels({...db,identity,after:null})).items[0].type).toBe('direct');
  expect(db.calls[0].methods).toContainEqual(['eq',['own.team_member_id',identity.memberId]]);expect(db.calls[0].methods).toContainEqual(['eq',['team_id',identity.teamId]]);
  await expect(readMobileMessageChannels({...setup([[channel],[]]),identity,after:null})).rejects.toMatchObject({status:403});
});
it('denies unjoined private channels even for owner metadata and pages delivered text with truthful attachment markers',async()=>{
  const denied=setup([null]);await expect(readMobileMessageThread({...denied,identity,channelId:id(1),before:null})).rejects.toMatchObject({status:403});expect(denied.from).toHaveBeenCalledOnce();
  const rows=Array.from({length:51},(_,n)=>({id:id(100-n),channel_id:id(1),sender_member_id:identity.memberId,body:'Text',created_at:time,updated_at:time,parent_message_id:id(9),attachment_file_id:id(8),scheduled_for:null,is_delivered:true,sender:{id:identity.memberId,team_id:identity.teamId,profiles:{full_name:'Actual sender'}}}));
  const db=setup([channel,rows,channel]);const result=await readMobileMessageThread({...db,identity,channelId:id(1),before:null});expect(result.items).toHaveLength(50);expect(result.nextCursor?.id).toBe(id(51));expect(result.items[0].attachmentFileId).toBe(id(8));
  expect(db.calls[1].methods).toContainEqual(['eq',['is_delivered',true]]);expect(db.calls[1].methods).toContainEqual(['order',['id',{ascending:false}]]);
  const before={createdAt:time,id:id(100)};const cursor=setup([channel,[],channel]);await readMobileMessageThread({...cursor,identity,channelId:id(1),before});expect(cursor.calls[1].methods).toContainEqual(['or',[`created_at.lt.${time},and(created_at.eq.${time},id.lt.${id(100)})`]]);
});
it('fails closed on current authority changes and cross-team sender data',async()=>{
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValue({...identity,role:'admin'});await expect(readMobileMessageChannels({...setup([[]]),identity,after:null})).rejects.toMatchObject({status:403});
});
