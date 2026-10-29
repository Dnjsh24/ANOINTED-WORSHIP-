// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildEventAssignments, buildEventDetails } from '@/lib/domain/event-workflows';
import { mobileEventCommandSchema, mobileEventCommandsRequestSchema, mobileEventFormSchema, prepareMobileEventSave } from './event-commands';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const value={title:'Sunday',eventType:'service_rehearsal' as const,date:'2026-10-18',startTime:'09:00',endTime:'11:00',rehearsalDate:'2026-10-17',rehearsalStartTime:'18:00',rehearsalEndTime:'19:00',location:'Sanctuary',assignedTeams:'Band',notes:'Service notes',worshipLeader:id(3),acousticGuitar:id(4),electricGuitar:id(5),bass:id(6),drums:id(7),mainKeys:id(8),secondKeys:id(9),extraBandMembers:[id(10)],backupSingers:[id(11)],media:id(12),dancers:[id(13)],templateId:id(20),linkedSetlistId:id(21),recurrence:'weekly' as const};
const command={commandId:id(30),eventId:id(31),type:'event.save' as const,mode:'create' as const,baseRevision:0,baseValue:null,value,linkedSetlistBase:{id:id(21),revision:4,eventId:null},dependsOn:[]};
describe('complete version2 event intent contract',()=>{
 it('preserves every EventForm field and reuses exact website detail/assignment builders',()=>{
  const checked=mobileEventCommandSchema.parse(command);expect(checked).toEqual(command);
  const prepared=prepareMobileEventSave(value);expect(prepared.details).toEqual(buildEventDetails(value));expect(prepared.assignments).toEqual(buildEventAssignments(value));expect(prepared.assignments).toHaveLength(11);
  expect(prepared.details.description).toBe('Service notes');expect(prepareMobileEventSave({...value,notes:''}).details.description).toBe('Band');
 });
 it('rejects forged approval/team fields, missing capture, invalid assignments and dates',()=>{
  for(const change of [{approvalStatus:'approved'},{teamId:id(99)},{date:'2026-02-30'},{worshipLeader:'not-uuid'},{backupSingers:[id(11),id(11)]},{linkedSetlistId:'bad'}]){
   expect(mobileEventFormSchema.safeParse({...value,...change}).success).toBe(false);
  }
  for(const change of [{baseRevision:1},{mode:'update'},{linkedSetlistBase:null},{linkedSetlistBase:{id:id(90),revision:4,eventId:null}},{baseValue:{}},{operation:'generic-upsert'}])expect(mobileEventCommandSchema.safeParse({...command,...change}).success).toBe(false);
 });
 it('retains template choice without inventing server-side template effects and defaults non-recurring saves',()=>{
  const {recurrence,...withoutRecurrence}=value;expect(recurrence).toBe('weekly');expect(mobileEventFormSchema.parse(withoutRecurrence).recurrence).toBe('none');expect(prepareMobileEventSave(value)).not.toHaveProperty('templateId');
 });
 it('validates stable unique IDs and ordered dependencies while allowing prior receipt dependencies',()=>{
  const next={...command,commandId:id(32),eventId:id(33),dependsOn:[command.commandId]};
  expect(mobileEventCommandsRequestSchema.parse({version:2,commands:[command,next]}).commands).toHaveLength(2);
  expect(mobileEventCommandsRequestSchema.safeParse({version:2,commands:[next,command]}).success).toBe(false);
  expect(mobileEventCommandsRequestSchema.safeParse({version:2,commands:[command,command]}).success).toBe(false);
  expect(mobileEventCommandsRequestSchema.safeParse({version:2,commands:[{...command,dependsOn:[id(90),id(90)]}]}).success).toBe(false);
  expect(mobileEventCommandsRequestSchema.safeParse({version:2,commands:[{...command,dependsOn:[id(90)]}]}).success).toBe(true);
 });
});
