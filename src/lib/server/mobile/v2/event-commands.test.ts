// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe,expect,it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileEventCommand,MobileEventSnapshot } from '@/lib/mobile/v2/event-commands';
import { applyMobileEventCommands } from './event-commands';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const timestamp='2026-10-16T00:00:00Z';
const identity={userId:id(1),teamId:id(2),memberId:id(3)};
const command:Extract<MobileEventCommand,{type:'event.save'}>={commandId:id(4),eventId:id(5),type:'event.save',mode:'create',baseRevision:0,baseValue:null,dependsOn:[],linkedSetlistBase:null,value:{title:'Sunday',eventType:'service',date:'2026-10-18',startTime:'09:00',location:'Hall',worshipLeader:id(3),recurrence:'none'}};
function snapshot():MobileEventSnapshot{return{record:{id:id(5),team_id:id(2),name:'Sunday',type:'service',event_date:'2026-10-18',starts_at:'09:00:00',ends_at:null,call_time:null,location:'Hall',description:null,rehearsal_date:null,rehearsal_time:null,rehearsal_end_time:null,recurrence_rule:null,recurrence_parent_id:null,approval_status:'approved',requested_assignments:[],created_by:id(1),created_at:timestamp,updated_at:timestamp,deleted_at:null,sync_revision:2},assignments:[{team_member_id:id(3),assignment:'Worship Leader'}],linkedSetlists:[]};}
function applied(){const state=snapshot();return{commandId:id(4),eventId:id(5),type:'event.save',payloadHash:'a'.repeat(64),status:'applied',snapshot:state,occurrences:[{index:0,snapshot:state}],deletion:null};}
function client(data:unknown=[applied()],status=200){const calls:unknown[]=[];const database=createClient<Database>('https://event-command.test','test-publishable',{auth:{persistSession:false},global:{fetch:async(url,init)=>{calls.push({url:String(url),body:JSON.parse(String(init?.body))});return Response.json(data,{status});}}});return{database,calls};}
async function apply(data:unknown,input:MobileEventCommand=command){return applyMobileEventCommands({client:client(data).database,identity,request:{version:2,commands:[input]}});}
describe('event command bearer adapter',()=>{
 it('uses exact named RPC and selected member/team, retaining complete form intent',async()=>{
  const {database,calls}=client();expect(await applyMobileEventCommands({client:database,identity,request:{version:2,commands:[command]}})).toMatchObject({version:2,identity,results:[applied()]});
  expect(calls).toEqual([{url:'https://event-command.test/rest/v1/rpc/mobile_apply_event_commands',body:{p_team_id:identity.teamId,p_member_id:identity.memberId,p_commands:[command]}}]);
 });
 it('rejects substituted snapshots, missing occurrences and fabricated metadata',async()=>{
  const good=applied();for(const record of [{team_id:id(99)},{id:id(99)},{name:'Substituted'},{event_date:'2026-10-19'},{starts_at:'09:00:30'},{description:'Private'},{sync_revision:0},{created_by:id(99)},{recurrence_rule:'weekly'},{deleted_at:timestamp}]){
   const state={...snapshot(),record:{...snapshot().record,...record}};
   await expect(apply([{...good,snapshot:state,occurrences:[{index:0,snapshot:state}]}])).rejects.toMatchObject({status:503});
  }
  for(const change of [{commandId:id(99)},{eventId:id(99)},{occurrences:[]},{occurrences:[good.occurrences[0],good.occurrences[0]]},{snapshot:{...snapshot(),private:'no'}},{deletion:{id:id(5),revision:2,deleted:true}}])await expect(apply([{...good,...change}])).rejects.toMatchObject({status:503});
 });
 it('verifies every recurring occurrence mapping and calendar month-end offsets',async()=>{
  const recurring={...command,value:{...command.value,date:'2026-01-31',recurrence:'monthly' as const}};
  const dates=['2026-01-31','2026-02-28','2026-03-31','2026-04-30'];const occurrences=dates.map((date,index)=>({index,snapshot:{...snapshot(),record:{...snapshot().record,id:index===0?command.eventId:id(20+index),event_date:date,recurrence_rule:'monthly',recurrence_parent_id:index===0?null:command.eventId}}}));
  const result={...applied(),snapshot:occurrences[0].snapshot,occurrences};expect(await apply([result],recurring)).toMatchObject({results:[result]});
  await expect(apply([{...result,occurrences:occurrences.slice(0,3)}],recurring)).rejects.toMatchObject({status:503});
  const bad=occurrences.map((row,index)=>index===2?{...row,snapshot:{...row.snapshot,record:{...row.snapshot.record,recurrence_parent_id:id(99)}}}:row);
  await expect(apply([{...result,occurrences:bad}],recurring)).rejects.toMatchObject({status:503});
 });
 it('validates delete tombstones and conflict base/local versions without approving a fabricated write',async()=>{
  const old=snapshot();const deletion:MobileEventCommand={commandId:id(4),eventId:id(5),type:'event.delete',baseRevision:2,baseValue:old,dependsOn:[]};
  const good={...applied(),type:'event.delete',snapshot:null,occurrences:[],deletion:{id:id(5),revision:3,deleted:true}};
  expect(await apply([good],deletion)).toMatchObject({results:[good]});await expect(apply([{...good,deletion:{...good.deletion,revision:2}}],deletion)).rejects.toMatchObject({status:503});
  const conflict={commandId:id(4),eventId:id(5),type:'event.delete',payloadHash:'a'.repeat(64),status:'conflict',baseValue:old,localValue:null,remote:old,linkedSetlist:null};
  expect(await apply([conflict],deletion)).toMatchObject({results:[conflict]});await expect(apply([{...conflict,baseValue:null}],deletion)).rejects.toMatchObject({status:503});
 });
 it('preserves the website owner edit of a rejected request without creating live assignments',async()=>{
  const base={...snapshot(),record:{...snapshot().record,approval_status:'rejected' as const},assignments:[]};
  const update={...command,mode:'update' as const,baseRevision:2,baseValue:base};
  const saved={...base,record:{...base.record,sync_revision:3}};
  const result={...applied(),snapshot:saved,occurrences:[{index:0,snapshot:saved}]};
  expect(await apply([result],update)).toMatchObject({results:[result]});
 });
 it.each([['42501',403],['40001',409],['40P01',409],['22023',400],['PGRST202',503]] as const)('maps SQL %s to safe %s',async(code,status)=>{
  await expect(applyMobileEventCommands({client:client({code,message:'private details'},400).database,identity,request:{version:2,commands:[command]}})).rejects.toMatchObject({status});
 });
});
