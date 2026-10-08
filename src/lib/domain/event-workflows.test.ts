import { describe, expect, it } from "vitest";
import { buildEventAssignments, buildSetlistDetails, eventAssignmentsSchema, eventScheduleWindows, mapEventAssignments } from "./event-workflows";
import { eventInputSchema, setlistInputSchema } from "./validators";
import { eventWindowsOverlap } from "./setlist-readiness";
const leader="11111111-1111-4111-8111-111111111111",singer="22222222-2222-4222-8222-222222222222";
describe("event and setlist workflow inputs",()=>{
  it("restores scalar and repeated assignments by membership ID",()=>{
    const input=eventInputSchema.parse({title:"Sunday",eventType:"service",date:"2026-10-11",startTime:"09:00",location:"Hall",worshipLeader:leader,backupSingers:[singer],media:leader});
    const rows=eventAssignmentsSchema.parse(buildEventAssignments(input));expect(mapEventAssignments(rows)).toMatchObject({worshipLeader:leader,backupSingers:[singer],media:leader});
    expect(eventAssignmentsSchema.safeParse([...rows,rows[0]]).success).toBe(false);
  });
  it("distinguishes an omitted leader from an explicitly cleared leader",()=>{
    const input=setlistInputSchema.parse({title:"Songs",eventType:"meeting",serviceDate:"2026-10-11",location:"Hall",callTime:"08:00",rehearsalTime:"08:30"});
    expect(buildSetlistDetails(input,[])).not.toHaveProperty("leader_member_id");expect(buildSetlistDetails({...input,worshipLeader:""},[])).toHaveProperty("leader_member_id",null);
  });
  it("checks both rehearsal and service windows without inventing separated times",()=>{
    const windows=eventScheduleWindows({id:"a",name:"Sunday",event_date:"2026-10-11",starts_at:"09:00",ends_at:"11:00",rehearsal_date:"2026-10-10",rehearsal_time:"18:00",rehearsal_end_time:"19:00"});
    expect(windows).toHaveLength(2);expect(windows.some(window=>eventWindowsOverlap(window,{id:"b",name:"Saturday",date:"2026-10-10",startsAt:"18:30",endsAt:"20:00"}))).toBe(true);
    expect(eventWindowsOverlap({id:"a",name:"Unknown",date:"2026-10-11"},{id:"b",name:"Late",date:"2026-10-11",startsAt:"18:00"})).toBe(true);
  });
  it("rejects invalid calendar dates and clock values at the input boundary",()=>{
    expect(eventInputSchema.safeParse({title:"Sunday",eventType:"service",date:"2026-02-30",startTime:"99:00",location:"Hall",worshipLeader:leader}).success).toBe(false);
  });
});
