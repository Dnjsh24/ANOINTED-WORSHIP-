import { describe, expect, it } from "vitest";
import { buildServiceOrderExport, defaultPreparationTasks, missingRequiredRoles, rehearsalPlanInputSchema, requiredRolesFromTemplate, serviceOrderInputSchema, serviceOrderTimeline, type ServiceOrderEntry } from "./team-workflows";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const entry:ServiceOrderEntry={id:id(1),kind:"song",title:"Opening",slot_id:id(2),duration_seconds:120,responsible_member_id:id(3),cue:"Quiet intro"};
describe("shared preparation and service planning",()=>{
  it("requires all ten distinct checks and unique valid slot allocations",()=>{
    const plan={setlistId:id(1),revision:0,allocations:[{slot_id:id(2),minutes:5,focus:"Harmony"}],tasks:defaultPreparationTasks()};
    expect(rehearsalPlanInputSchema.safeParse(plan).success).toBe(true);
    expect(rehearsalPlanInputSchema.safeParse({...plan,tasks:plan.tasks.map(()=>plan.tasks[0])}).success).toBe(false);
    expect(rehearsalPlanInputSchema.safeParse({...plan,allocations:[...plan.allocations,...plan.allocations]}).success).toBe(false);
    expect(rehearsalPlanInputSchema.safeParse({...plan,allocations:[{...plan.allocations[0],minutes:1.5}]}).success).toBe(false);
    expect(rehearsalPlanInputSchema.safeParse({...plan,teamId:id(9)}).success).toBe(false);
  });
  it("binds song items to slots and bounds cues and timing",()=>{
    const order={eventId:id(1),revision:0,entries:[entry],requiredRoles:["Main Keys"]};
    expect(serviceOrderInputSchema.safeParse(order).success).toBe(true);
    for(const invalid of [{...entry,slot_id:null},{...entry,kind:"prayer"},{...entry,duration_seconds:7201},{...entry,cue:"x".repeat(2001)}]){
      expect(serviceOrderInputSchema.safeParse({...order,entries:[invalid]}).success).toBe(false);
    }
    expect(serviceOrderInputSchema.safeParse({...order,entries:[entry,entry]}).success).toBe(false);
    expect(serviceOrderInputSchema.safeParse({...order,requiredRoles:["Main Keys","Main Keys"]}).success).toBe(false);
  });
  it("calculates sequential planned times including midnight",()=>{
    const rows=serviceOrderTimeline("23:59:00",[entry,{...entry,id:id(4)}]);
    expect(rows.map(row=>row.plannedStart)).toEqual(["23:59","00:01 (+1 day)"]);
    expect(serviceOrderTimeline("25:90",[entry])).toEqual([]);
    expect(entry).not.toHaveProperty("plannedStart");
  });
  it("counts declined positions as missing while pending confirmations remain explicit",()=>{
    expect(missingRequiredRoles(["Drums","Main Keys","Media"],[{assignment:"Drums",state:"declined"},{assignment:"Main Keys",state:"pending"}])).toEqual(["Drums","Media"]);
  });
  it("uses template role keys and ignores unrelated fields",()=>{
    expect(requiredRolesFromTemplate({worshipLeader:"",mainKeys:"",media:"",unknown:true})).toEqual(["Worship Leader","Main Keys","Media"]);
    expect(requiredRolesFromTemplate(null)).toEqual([]);
    expect(requiredRolesFromTemplate([])).toEqual([]);
  });
  it("exports planned time, responsibility and cues without duplicating lyrics",()=>{
    const text=buildServiceOrderExport("Sunday","09:00",[entry],[{id:id(3),name:"Dana"}]);
    expect(text).toContain("09:00 | Opening (song) | 2 min");
    expect(text).toContain("Responsible: Dana");
    expect(text).toContain("Cue: Quiet intro");
  });
});
