import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), rpc: vi.fn(), from: vi.fn(), role: "owner", customPermissions: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true, getSiteUrl: () => "http://localhost" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => false }));
vi.mock("@/lib/desktop/workspace", () => ({}));
vi.mock("@/lib/desktop/sync", () => ({}));
vi.mock("@/lib/push-notifications", () => ({ notifyProfiles: vi.fn() }));
vi.mock("@/lib/domain/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/supabase/team-context", () => ({ getCurrentTeamContext: vi.fn(), getCurrentTeamContextForClient: vi.fn() }));
import { createEventAction, createSetlistAction, updateEventAction, updateSetlistAction, reviewEventAction, updateSetlistSongKeyAction } from "./actions";
const teamId = "11111111-1111-4111-8111-111111111111", memberId = "22222222-2222-4222-8222-222222222222", targetId = "33333333-3333-4333-8333-333333333333";
const eventForm = () => { const form = new FormData(); Object.entries({ title:"Sunday",eventType:"service",date:"2026-10-11",startTime:"09:00",endTime:"11:00",location:"Hall",worshipLeader:memberId,revision:"1",eventId:targetId,recurrence:"monthly" }).forEach(([key,value])=>form.set(key,value)); return form; };
const setlistForm = () => { const form = new FormData(); Object.entries({title:"Sunday songs",serviceDate:"2026-10-11",eventType:"service",serviceType:"Sunday Worship",location:"Hall",callTime:"08:00",rehearsalTime:"08:30"}).forEach(([key,value])=>form.set(key,value));form.append("songIds",targetId);return form; };
beforeEach(() => {
  vi.clearAllMocks(); mocks.role="owner"; mocks.customPermissions=[]; mocks.rpc.mockResolvedValue({data:null,error:{message:"write failed"}});
  mocks.from.mockImplementation((table:string) => {
    const data = table === "custom_roles" ? {permissions:mocks.customPermissions} : {id:memberId,team_id:teamId,role:mocks.role,status:"active",custom_role_id:mocks.customPermissions.length?targetId:null,custom_roles:{team_id:teamId,permissions:mocks.customPermissions},teams:{id:teamId}};
    const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data,error:null})};return query;
  });
  mocks.client.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:targetId}}})},from:mocks.from,rpc:mocks.rpc});
});
describe("atomic workspace action outcomes", () => {
  it("creates an approved event through the guarded workflow", async () => {
    mocks.rpc.mockResolvedValue({data:targetId,error:null});
    await createEventAction({ok:false,message:""},eventForm());
    expect(mocks.rpc).toHaveBeenCalledWith("save_event_workspace",expect.objectContaining({p_team_id:teamId,p_event_id:null}));
    expect(mocks.redirect).toHaveBeenCalledWith(`/events/${targetId}`);
  });
  it("preserves an event draft when creation fails", async () => {
    expect(await createEventAction({ok:false,message:""},eventForm())).toMatchObject({ok:false,message:expect.stringContaining("No changes were applied")});
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("creates a setlist and its songs through the guarded workflow", async () => {
    const form=setlistForm();
    mocks.rpc.mockResolvedValue({data:targetId,error:null});
    await createSetlistAction({ok:false,message:""},form);
    expect(mocks.rpc).toHaveBeenCalledWith("save_setlist_workspace",expect.objectContaining({p_team_id:teamId,p_setlist_id:null,p_song_ids:[targetId]}));
    expect(mocks.redirect).toHaveBeenCalledWith(`/setlists/${targetId}`);
  });
  it("preserves a setlist draft when creation fails", async () => {
    const form=setlistForm();
    expect(await createSetlistAction({ok:false,message:""},form)).toMatchObject({ok:false,message:expect.stringContaining("No changes were applied")});
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("preserves the key and avoids success revalidation when the guarded slot RPC rejects a foreign or unavailable slot", async () => {
    const form = new FormData();form.set("setlistId",targetId);form.set("slotId",memberId);form.set("assignedKey","Eb");
    mocks.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"Slot unavailable"}});
    expect(await updateSetlistSongKeyAction(form)).toEqual({ok:false,message:"Failed to update key."});
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_setlist_slot",{p_setlist_id:targetId,p_slot_id:memberId,p_operation:"update",p_values:{assigned_key:"Eb"}});
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rejects malformed slot identity and oversized keys before mutation", async () => {
    const form = new FormData();form.set("setlistId",targetId);form.set("slotId","not a uuid");form.set("assignedKey","invalid key");
    expect(await updateSetlistSongKeyAction(form)).toMatchObject({ok:false});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns an event error without redirecting or announcing a successful save", async () => {
    expect(await updateEventAction({ok:false,message:""},eventForm())).toMatchObject({ok:false,message:expect.stringContaining("No changes were applied")});
    expect(mocks.rpc).toHaveBeenCalledWith("save_event_workspace",expect.objectContaining({p_event_id:targetId,p_team_id:teamId,p_assignments:[{team_member_id:memberId,assignment:"Worship Leader"}]}));
    expect(mocks.redirect).not.toHaveBeenCalled();expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("keeps ordinary-member requests pending and sends proposed assignments", async () => {
    mocks.role="member";mocks.rpc.mockResolvedValue({data:targetId,error:null});
    expect(await createEventAction({ok:false,message:""},eventForm())).toMatchObject({ok:true,message:expect.stringContaining("request sent")});
    expect(mocks.rpc).toHaveBeenCalledWith("save_event_workspace",expect.objectContaining({p_event_id:null,p_details:expect.objectContaining({recurrence_rule:"monthly"}),p_assignments:[{team_member_id:memberId,assignment:"Worship Leader"}]}));
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("uses persisted custom workspace permissions while refusing invalid member IDs", async () => {
    mocks.role="member"; mocks.customPermissions=["events.manage"];
    await updateEventAction({ok:false,message:""},eventForm());expect(mocks.rpc).toHaveBeenCalledOnce();
    mocks.rpc.mockClear();const invalid=eventForm();invalid.set("worshipLeader","profile name");
    expect(await updateEventAction({ok:false,message:""},invalid)).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns setlist transaction failures without deleting slots from the action", async () => {
    const form = new FormData();Object.entries({revision:"1",setlistId:targetId,title:"Songs",eventType:"service",serviceType:"Sunday",serviceDate:"2026-10-11",location:"Hall",callTime:"08:00",rehearsalTime:"08:30",worshipLeader:memberId}).forEach(([key,value])=>form.set(key,value));form.append("songIds",targetId);
    expect(await updateSetlistAction({ok:false,message:""},form)).toMatchObject({ok:false});
    expect(mocks.rpc).toHaveBeenCalledWith("save_setlist_workspace",expect.objectContaining({p_song_ids:[targetId],p_details:expect.objectContaining({leader_member_id:memberId})}));
    expect(mocks.from.mock.calls.every(([table])=>table==="team_members")).toBe(true);expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("reviews through the approval transaction and reports its failure", async () => {
    const form=new FormData();form.set("eventId",targetId);form.set("decision","approved");
    expect(await reviewEventAction(form)).toMatchObject({ok:false});expect(mocks.rpc).toHaveBeenCalledWith("review_event_request",{p_event_id:targetId,p_decision:"approved"});expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
