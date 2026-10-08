import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultPreparationTasks } from "@/lib/domain/team-workflows";
import type { PreparationWorkspace, ServiceWorkspace as ServiceData } from "@/lib/supabase/workflow-data";
const actions=vi.hoisted(()=>({savePlan:vi.fn(),respondTask:vi.fn(),saveOrder:vi.fn(),respondRole:vi.fn(),readiness:vi.fn(),reloadPlan:vi.fn(),reloadOrder:vi.fn()}));
vi.mock("@/app/workflow-actions",()=>({saveRehearsalPlanAction:actions.savePlan,respondPreparationTaskAction:actions.respondTask,saveServiceOrderAction:actions.saveOrder,respondAssignmentAction:actions.respondRole,respondSongReadinessAction:actions.readiness,reloadPreparationAction:actions.reloadPlan,reloadServiceOrderAction:actions.reloadOrder}));
import { SharedPreparation } from "./shared-preparation";
import { SavedSongReadiness } from "./saved-song-readiness";
import { ServiceWorkspace } from "./service-workspace";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const songs=[{id:id(1),title:"Opening",assignedKey:"D",bpm:100}];
const preparation:PreparationWorkspace={plan:{setlist_id:id(2),team_id:id(3),revision:1,allocations:[{slot_id:id(1),minutes:5,focus:"Intro"}],tasks:defaultPreparationTasks().map(task=>({...task,assignee_member_id:id(4)})),updated_by:id(5),updated_at:"2026-10-06"},checks:[],readiness:[],members:[{id:id(4),name:"Dana"},{id:id(6),name:"Jess"}],assignedMemberIds:[id(4)]};
const service:ServiceData={order:null,assignments:[{id:id(8),team_member_id:id(4),assignment:"Drums"},{id:id(9),team_member_id:id(6),assignment:"Main Keys"}],responses:[],members:preparation.members,templates:[{id:id(7),name:"Sunday",default_roles:{drums:"",media:""}}]};
beforeEach(()=>{vi.clearAllMocks();for(const action of Object.values(actions))action.mockResolvedValue({ok:true,message:"Saved",data:{revision:2}});});
describe("saved team preparation",()=>{
  it("saves a manager draft without losing focus on a stale response",async()=>{
    const user=userEvent.setup();actions.savePlan.mockResolvedValue({ok:false,message:"Keep your draft"});
    render(<SharedPreparation setlistId={id(2)} name="Sunday" songs={songs} workspace={preparation} memberId={id(4)} canManage/>);
    const focus=screen.getByRole("textbox",{name:"Focus for Opening"});await user.clear(focus);await user.type(focus,"Ending harmony");await user.click(screen.getByRole("button",{name:"Save shared plan"}));
    expect(actions.savePlan).toHaveBeenCalledWith(expect.objectContaining({revision:1,allocations:[{slot_id:id(1),minutes:5,focus:"Ending harmony"}]}));
    expect(focus).toHaveValue("Ending harmony");expect(await screen.findByRole("status")).toHaveTextContent("Keep your draft");
  });
  it("allows only assigned checks and changes them after success",async()=>{
    const user=userEvent.setup();render(<SharedPreparation setlistId={id(2)} name="Sunday" songs={songs} workspace={preparation} memberId={id(4)} canManage={false}/>);
    expect(screen.getByRole("textbox",{name:"Focus for Opening"})).toBeDisabled();
    const checkbox=screen.getByRole("checkbox",{name:"Tune instruments and check cables"});await user.click(checkbox);
    await waitFor(()=>expect(checkbox).toBeChecked());expect(actions.respondTask).toHaveBeenCalledWith({setlistId:id(2),taskKey:"Tune instruments and check cables",completed:true});
  });
  it("submits a member draft for approval without direct-save authority",async()=>{
    const user=userEvent.setup();const proposeAction=vi.fn().mockResolvedValue({ok:true,message:"Requested"});
    render(<SharedPreparation setlistId={id(2)} name="Sunday" songs={songs} workspace={preparation} memberId={id(6)} canManage={false} proposeAction={proposeAction}/>);
    expect(screen.getByRole("checkbox",{name:"Tune instruments and check cables"})).toBeDisabled();
    await user.type(screen.getByRole("textbox",{name:"Reason for requested changes"}),"More harmony time");await user.click(screen.getByRole("button",{name:"Request plan changes"}));
    await waitFor(()=>expect(proposeAction).toHaveBeenCalledWith(expect.objectContaining({reason:"More harmony time",revision:1,requestNonce:expect.any(String)})));
    expect(actions.savePlan).not.toHaveBeenCalled();
  });
  it("reloads only on an explicit draft-replacement click",async()=>{
    const user=userEvent.setup();actions.reloadPlan.mockResolvedValue({ok:true,data:{...preparation,plan:{...preparation.plan,revision:4,allocations:[{slot_id:id(1),minutes:10,focus:"Latest focus"}]}}});
    render(<SharedPreparation setlistId={id(2)} name="Sunday" songs={songs} workspace={preparation} memberId={id(4)} canManage/>);
    await user.click(screen.getByRole("button",{name:"Reload latest plan (replace draft)"}));
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"Focus for Opening"})).toHaveValue("Latest focus"));
    expect(screen.getByText(/Version 4/)).toBeInTheDocument();
  });
});
describe("service order and assignment responses",()=>{
  it("plans timed items and template roles with no lyrics duplication",async()=>{
    const user=userEvent.setup();render(<ServiceWorkspace eventId={id(10)} name="Sunday" startsAt="09:00" workspace={service} songs={songs} memberId={id(4)} canManage/>);
    await user.click(screen.getByRole("button",{name:"Add order item"}));await user.type(screen.getByRole("textbox",{name:"Item 1 title"}),"Opening prayer");
    await user.selectOptions(screen.getByRole("combobox",{name:"Use roles from a service template"}),id(7));
    expect(screen.getByText(/Missing or declined roles: Media/)).toBeInTheDocument();await user.click(screen.getByRole("button",{name:"Save service order"}));
    expect(actions.saveOrder).toHaveBeenCalledWith(expect.objectContaining({eventId:id(10),requiredRoles:["Drums","Media"],entries:[expect.objectContaining({title:"Opening prayer",duration_seconds:60,slot_id:null})]}));
  });
  it("limits personal controls to your own role and keeps availability separate",async()=>{
    const user=userEvent.setup();render(<ServiceWorkspace eventId={id(10)} name="Sunday" startsAt="09:00" workspace={service} songs={songs} memberId={id(4)} canManage={false}/>);
    expect(screen.queryByRole("combobox",{name:"Your Main Keys response"})).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox",{name:"Your Drums response"}),"confirmed");await user.click(screen.getByRole("button",{name:"Save Drums response"}));
    expect(actions.respondRole).toHaveBeenCalledWith({assignmentId:id(8),state:"confirmed",note:""});
    expect(screen.getByText(/availability RSVP/)).toBeInTheDocument();
  });
});
describe("saved readiness",()=>{
  it("requires an event link and assignment before response controls",()=>{
    render(<SavedSongReadiness slotId={id(1)} linkedEvent={false} assigned={false} summary={[]}/>);
    expect(screen.queryByRole("button",{name:"Save my readiness"})).not.toBeInTheDocument();expect(screen.getByText(/Link this setlist/)).toBeInTheDocument();
  });
  it("keeps failed readiness notes and distinguishes session practice",async()=>{
    actions.readiness.mockRejectedValue(new Error("Offline"));const user=userEvent.setup();
    render(<SavedSongReadiness slotId={id(1)} linkedEvent assigned summary={[]}/>);
    await user.selectOptions(screen.getByRole("combobox",{name:"Your readiness"}),"needs_help");await user.type(screen.getByRole("textbox",{name:"Your readiness note"}),"Need harmony help");await user.click(screen.getByRole("button",{name:"Save my readiness"}));
    expect(await screen.findByRole("status")).toHaveTextContent("Keep your note");expect(screen.getByRole("textbox",{name:"Your readiness note"})).toHaveValue("Need harmony help");
    expect(screen.getByText(/separate from/)).toBeInTheDocument();
  });
});
