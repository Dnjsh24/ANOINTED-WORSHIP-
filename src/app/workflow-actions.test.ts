import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreparationTasks } from "@/lib/domain/team-workflows";
const mocks=vi.hoisted(()=>({
  context:vi.fn(), rpc:vi.fn(), env:vi.fn(()=>true), revalidate:vi.fn(),
}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/lib/supabase/team-guard",()=>({getRequiredTeamContext:mocks.context}));
vi.mock("@/lib/supabase/env",()=>({hasSupabaseEnv:mocks.env}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mocks.rpc})}));
vi.mock("@/lib/supabase/workflow-data",()=>({loadPreparationWorkspace:vi.fn(),loadServiceWorkspace:vi.fn()}));
import { respondAssignmentAction, respondPreparationTaskAction, respondSongReadinessAction, saveRehearsalPlanAction, saveServiceOrderAction } from "./workflow-actions";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const plan={setlistId:id(1),revision:0,allocations:[],tasks:defaultPreparationTasks()};
const order={eventId:id(2),revision:0,entries:[],requiredRoles:["Drums"]};
beforeEach(()=>{
  vi.clearAllMocks();mocks.env.mockReturnValue(true);
  mocks.context.mockResolvedValue({userId:id(3),memberId:id(4),teamId:id(5),role:"owner"});
  mocks.rpc.mockResolvedValue({data:1,error:null});
});
describe("workflow server action boundaries",()=>{
  it("sends only validated document/revision fields, with no caller actor/team identity",async()=>{
    expect((await saveRehearsalPlanAction(plan)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("save_rehearsal_plan",{p_setlist_id:id(1),p_expected_revision:0,p_allocations:[],p_tasks:plan.tasks});
    expect((await saveServiceOrderAction(order)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("save_service_order",{p_event_id:id(2),p_expected_revision:0,p_entries:[],p_required_roles:["Drums"]});
  });
  it("requires relevant stored context permission for direct shared saves",async()=>{
    mocks.context.mockResolvedValue({userId:id(3),memberId:id(4),teamId:id(5),role:"member"});
    expect((await saveRehearsalPlanAction(plan)).ok).toBe(false);
    expect((await saveServiceOrderAction(order)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.context.mockResolvedValue({userId:id(3),memberId:id(4),teamId:id(5),role:"member",customPermissions:["setlists.manage"]});
    expect((await saveRehearsalPlanAction(plan)).ok).toBe(true);
    expect((await saveServiceOrderAction(order)).ok).toBe(false);
  });
  it("rejects extra identities and malformed inputs before querying",async()=>{
    expect((await saveRehearsalPlanAction({...plan,teamId:id(99)})).ok).toBe(false);
    expect((await respondAssignmentAction({assignmentId:id(1),state:"confirmed",note:"",memberId:id(99)})).ok).toBe(false);
    expect((await respondSongReadinessAction({slotId:id(1),state:"unknown",note:""})).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a conflict without invalidating or replacing the draft",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"40001"}});
    const result=await saveRehearsalPlanAction(plan);
    expect(result.ok).toBe(false);expect(result.message).toContain("Keep your draft");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("keeps failures explicit and retryable",async()=>{
    mocks.rpc.mockRejectedValue(new Error("Network unavailable"));
    expect((await saveServiceOrderAction(order)).message).toContain("Your draft is unchanged");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("allows members to submit personal responses with actor derived by SQL",async()=>{
    mocks.context.mockResolvedValue({userId:id(3),memberId:id(4),teamId:id(5),role:"member"});
    expect((await respondPreparationTaskAction({setlistId:id(1),taskKey:plan.tasks[0].key,completed:true})).ok).toBe(true);
    expect((await respondSongReadinessAction({slotId:id(1),state:"ready",note:"Intro learned"})).ok).toBe(true);
    expect((await respondAssignmentAction({assignmentId:id(1),state:"declined",note:"Away"})).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("respond_assignment",{p_assignment_id:id(1),p_state:"declined",p_note:"Away"});
    expect(mocks.rpc).toHaveBeenCalledWith("respond_song_readiness",{p_slot_id:id(1),p_state:"ready",p_note:"Intro learned"});
  });
  it("does not pretend demo mode saved shared data",async()=>{
    mocks.env.mockReturnValue(false);
    expect((await saveRehearsalPlanAction(plan)).ok).toBe(false);
    expect((await respondAssignmentAction({assignmentId:id(1),state:"confirmed",note:""})).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
