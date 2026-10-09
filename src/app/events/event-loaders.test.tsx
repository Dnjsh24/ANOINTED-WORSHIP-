import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),context:vi.fn(),form:vi.fn(),roster:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/supabase/env",()=>({hasSupabaseEnv:()=>true}));
vi.mock("@/lib/supabase/team-guard",()=>({getRequiredTeamContext:mocks.context}));
vi.mock("@/components/app-shell",()=>({AppShell:({children}:{children:ReactNode})=>children}));
vi.mock("@/components/event-form",()=>({EventForm:(props:unknown)=>{mocks.form(props);return null;}}));
vi.mock("@/components/attendance-roster",()=>({AttendanceRoster:(props:unknown)=>{mocks.roster(props);return null;}}));
vi.mock("@/components/attendance-toggle",()=>({AttendanceToggle:()=>null}));
vi.mock("@/components/event-delete-button",()=>({EventDeleteButton:()=>null}));
vi.mock("@/lib/supabase/workflow-data",()=>({loadServiceWorkspace:async()=>({ok:false,message:"Shared planning unavailable"})}));
vi.mock("@/components/service-workspace",()=>({ServiceWorkspace:()=>null}));
import EventDetailPage from "./[id]/page";
import EditEventPage from "./[id]/edit/page";
import NewEventPage from "./new/page";
const teamId="11111111-1111-4111-8111-111111111111",memberId="22222222-2222-4222-8222-222222222222",profileId="33333333-3333-4333-8333-333333333333",eventId="44444444-4444-4444-8444-444444444444";
const event={id:eventId,name:"Sunday",type:"service",event_date:"2026-10-11",starts_at:"09:00",ends_at:"11:00",approval_status:"approved",rehearsal_date:null,rehearsal_time:null,rehearsal_end_time:null,location:"Hall",description:null,recurrence_rule:null,requested_assignments:[],event_assignments:[{team_member_id:memberId,assignment:"Worship Leader"}],setlists:[]};
function client(failedTable?:string){
  const filters:Array<[string,string,unknown]>=[];
  const from=vi.fn((table:string)=>{
    const data:unknown=table==="events"?event:table==="attendance"?[{status:"available",team_member:{profile_id:profileId,profiles:{full_name:"Alex",avatar_url:null}}}]:table==="team_members"?[{id:memberId,profile_id:profileId,role:"member",status:"active",ministry:"Worship",ministries:["Worship"]}]:table==="profiles"?[{id:profileId,full_name:"Alex",email:"alex@example.org"}]:[];
    const result={data:failedTable===table?null:data,error:failedTable===table?{message:"Unavailable"}:null,count:2};
    const query={select:vi.fn((columns:string)=>{filters.push([table,"select",columns]);return query;}),eq:vi.fn((key:string,value:unknown)=>{filters.push([table,key,value]);return query;}),order:()=>query,in:()=>query,gte:()=>query,maybeSingle:async()=>result,then:(resolve:(value:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};return query;
  });mocks.client.mockResolvedValue({from});return filters;
}
beforeEach(()=>{vi.clearAllMocks();mocks.context.mockResolvedValue({teamId,userId:profileId,memberId,role:"owner"});});
describe("event page data correctness",()=>{
  it("loads attendance through active same-team membership and uses the member profile identity",async()=>{
    const filters=client();renderToStaticMarkup(await EventDetailPage({params:Promise.resolve({id:eventId})}));
    expect(mocks.roster).toHaveBeenCalledWith({roster:[{status:"available",profileId,fullName:"Alex",avatarUrl:undefined}],totalMembers:2});
    expect(filters).toContainEqual(["attendance","team_member.team_id",teamId]);expect(filters).toContainEqual(["attendance","team_member.status","active"]);
    expect(filters.find(([table,key])=>table==="attendance"&&key==="select")?.[2]).toContain("team_members!inner");
  });
  it.each(["attendance","team_members"])("throws unavailable when %s cannot load instead of inventing attendance",async(table)=>{
    client(table);await expect(EventDetailPage({params:Promise.resolve({id:eventId})})).rejects.toThrow("attendance is unavailable");expect(mocks.roster).not.toHaveBeenCalled();
  });
  it("separates an event query failure from a missing event",async()=>{
    client("events");await expect(EventDetailPage({params:Promise.resolve({id:eventId})})).rejects.toThrow("details are unavailable");
  });
  it("restores saved assignment membership IDs into the edit form",async()=>{
    const filters=client();renderToStaticMarkup(await EditEventPage({params:Promise.resolve({id:eventId})}));
    expect(mocks.form).toHaveBeenCalledWith(expect.objectContaining({initialAssignments:expect.objectContaining({worshipLeader:memberId}),teamMembers:expect.arrayContaining([expect.objectContaining({id:memberId})])}));
    expect(filters).toContainEqual(["team_members","status","active"]);
  });
  it("loads selectable active members for pending requests even without setlist permission",async()=>{
    const filters=client();mocks.context.mockResolvedValue({teamId,userId:profileId,memberId,role:"band_leader"});renderToStaticMarkup(await NewEventPage({searchParams:Promise.resolve({})}));
    expect(mocks.form).toHaveBeenCalledWith(expect.objectContaining({requiresApproval:true,canLinkSetlists:false,teamMembers:expect.arrayContaining([expect.objectContaining({id:memberId})])}));
    expect(filters.some(([table])=>table==="setlists")).toBe(false);
  });
});
