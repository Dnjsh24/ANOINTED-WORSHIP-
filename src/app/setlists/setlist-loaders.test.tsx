import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),attendance:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/supabase/env",()=>({hasSupabaseEnv:()=>true}));
vi.mock("@/lib/supabase/team-guard",()=>({getRequiredTeamContext:async()=>({teamId:"team",userId:"profile",memberId:"member",role:"owner"})}));
vi.mock("@/components/app-shell",()=>({AppShell:({children}:{children:ReactNode})=>children}));
vi.mock("@/components/attendance-toggle",()=>({AttendanceToggle:(props:unknown)=>{mocks.attendance(props);return null;}}));
vi.mock("@/components/share-button",()=>({ShareButton:()=>null}));
vi.mock("@/components/setlist-song-order",()=>({SetlistSongOrder:()=>null}));
vi.mock("@/lib/supabase/workflow-data",()=>({loadPreparationWorkspace:async()=>({ok:false,message:"Shared planning unavailable"})}));
vi.mock("@/components/shared-preparation",()=>({SharedPreparation:()=>null}));
import SetlistDetailPage from "./[id]/page";
function client(linked=true,failure?:string){
  const filters:Array<[string,string,unknown]>=[];
  const event={id:"event",name:"Sunday",type:"service_rehearsal",event_date:"2026-10-11",starts_at:"09:00",ends_at:"11:00",rehearsal_date:"2026-10-10",rehearsal_time:"18:00",rehearsal_end_time:"19:00"};
  const setlist={id:"setlist",name:"Songs",setlist_date:"2026-10-11",location:"Hall",call_time:"08:00",rehearsal_time:"08:30",service_times:["Sunday"],event_id:linked?"event":null,events:linked?event:null,leader:null,setlist_songs:[]};
  let assignmentReads=0;
  const from=vi.fn((table:string)=>{
    const conflict=table==="event_assignments"&&assignmentReads++>0;
    const data:unknown=table==="setlists"?setlist:table==="event_assignments"&&!conflict?[{team_member_id:"member",assignment:"Worship Leader",team_member:{id:"member",profile_id:"profile",profiles:{id:"profile",full_name:"Alex"}}}]:[];
    const result={data,error:failure===(conflict?"conflicts":table)?{message:"Unavailable"}:null,count:2};
    const query={select:(columns:string)=>{filters.push([table,"select",columns]);return query;},eq:(key:string,value:unknown)=>{filters.push([table,key,value]);return query;},order:()=>query,in:()=>query,neq:()=>query,or:(value:string,options:unknown)=>{filters.push([table,"or",[value,options]]);return query;},limit:()=>query,maybeSingle:async()=>result,then:(resolve:(value:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};return query;
  });mocks.client.mockResolvedValue({from});return filters;
}
beforeEach(()=>vi.clearAllMocks());
describe("setlist event readiness",()=>{
  it("keeps standalone setlists free of invented attendance and conflict clearance",async()=>{
    client(false);const html=renderToStaticMarkup(await SetlistDetailPage({params:Promise.resolve({id:"setlist"})}));
    expect(html).toContain("Attendance opens when an event is linked");expect(html).toContain("Link an event to check member assignments");expect(html).not.toContain("No overlapping member assignments found");expect(mocks.attendance).not.toHaveBeenCalled();
  });
  it("filters the actual event alias and includes rehearsal dates when checking conflicts",async()=>{
    const filters=client();await SetlistDetailPage({params:Promise.resolve({id:"setlist"})});
    expect(filters).toContainEqual(["event_assignments","event.team_id","team"]);expect(filters).toContainEqual(["event_assignments","event.approval_status","approved"]);
    expect(filters.find(([,key])=>key==="or")?.[2]).toEqual([expect.stringContaining("2026-10-10"),{referencedTable:"event"}]);
  });
  it.each(["attendance","conflicts"])("reports unavailable %s rather than a clean readiness result",async(failure)=>{
    client(true,failure);await expect(SetlistDetailPage({params:Promise.resolve({id:"setlist"})})).rejects.toThrow("unavailable");
  });
});
