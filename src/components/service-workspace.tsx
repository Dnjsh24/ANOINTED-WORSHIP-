"use client";

import { useState } from "react";
import { respondAssignmentAction, saveServiceOrderAction, reloadServiceOrderAction } from "@/app/workflow-actions";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { buildServiceOrderExport, missingRequiredRoles, requiredRolesFromTemplate, serviceOrderTimeline, type AssignmentState, type ServiceOrderEntry } from "@/lib/domain/team-workflows";
import type { ServiceWorkspace as Workspace, WorkflowAssignment } from "@/lib/supabase/workflow-data";
import type { AssignmentResponseRow } from "@/lib/supabase/workflow.types";

export type OrderProposalAction = (input: { revision: number; entries: ServiceOrderEntry[]; required_roles: string[]; reason: string; requestNonce: string }) => Promise<ActionState>;
const field = "min-h-11 w-full min-w-0 rounded border border-white/20 bg-zinc-900 px-3 text-sm text-white disabled:opacity-60";
export function ServiceWorkspace({ eventId, name, startsAt, workspace, songs, memberId, canManage, proposeAction }: {
  eventId: string; name: string; startsAt: string; workspace: Workspace; songs: { id: string; title: string }[]; memberId: string; canManage: boolean; proposeAction?: OrderProposalAction;
}) {
  const [revision,setRevision] = useState(workspace.order?.revision ?? 0);
  const [entries,setEntries] = useState<ServiceOrderEntry[]>(workspace.order?.entries ?? []);
  const [requiredRoles,setRequiredRoles] = useState(workspace.order?.required_roles ?? []);
  const [responses,setResponses] = useState(workspace.responses);
  const [reason,setReason] = useState("");
  const [nonce,setNonce] = useState<string | null>(null);
  const [pending,setPending] = useState(false);
  const [status,setStatus] = useState("");
  const editable = canManage || Boolean(proposeAction);
  const names = new Map(workspace.members.map(member => [member.id,member.name]));
  const missing = missingRequiredRoles(requiredRoles.filter(role=>role.trim()), workspace.assignments.map(row => ({ assignment: row.assignment, state: responses.find(response => response.assignment_id === row.id)?.state ?? "pending" })));
  const timeline = serviceOrderTimeline(startsAt,entries);
  function edit(id: string, patch: Partial<ServiceOrderEntry>) {
    setEntries(current => current.map(row => row.id === id ? { ...row,...patch } : row)); setNonce(null);
  }
  function move(index: number, direction: number) {
    setEntries(current => { const next = [...current]; [next[index],next[index + direction]] = [next[index + direction],next[index]]; return next; }); setNonce(null);
  }
  async function save() {
    setPending(true);setStatus("");
    try {
      const requestNonce = nonce ?? crypto.randomUUID(); if (!canManage) setNonce(requestNonce);
      const roles=requiredRoles.map(role=>role.trim()).filter(Boolean);
      const result = canManage ? await saveServiceOrderAction({ eventId,revision,entries,requiredRoles:roles }) : await proposeAction?.({ revision,entries,required_roles:roles,reason,requestNonce });
      if (!result) return;
      setStatus(result.message);
      if (result.ok && canManage && typeof result.data?.revision === "number") {setRevision(result.data.revision);setRequiredRoles(roles);}
    } catch { setStatus("Could not save. Your order draft is unchanged. Retry when connected."); }
    finally { setPending(false); }
  }
  function download() {
    const text = buildServiceOrderExport(name,startsAt,entries,workspace.members);
    const url = URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));
    const link = document.createElement("a");link.href=url;link.download="service-running-order.txt";link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  async function reload() {
    setPending(true);
    try {
      const result=await reloadServiceOrderAction(eventId);
      if (!result.ok) {setStatus(result.message);return;}
      setRevision(result.data.order?.revision??0);setEntries(result.data.order?.entries??[]);setRequiredRoles(result.data.order?.required_roles??[]);setResponses(result.data.responses);setNonce(null);
      setStatus("Latest service order loaded. Draft replaced.");
    } catch {setStatus("Latest order could not be loaded. Your draft is unchanged.");}
    finally {setPending(false);}
  }
  return <section aria-label="Service planning and assignments" className="space-y-5 rounded-2xl border border-white/10 bg-[#111014]/80 p-5">
    <h2 className="text-lg font-bold">Service running order</h2>
    <p className="text-sm text-zinc-400">Plan songs, prayer, readings, announcements and production cues. Times are planned; Stage Mode remains your live view.</p>
    <p className="text-sm text-violet-200">{entries.reduce((sum,row)=>sum+row.duration_seconds,0)/60} planned minutes · Version {revision}</p>
    {entries.length === 0 && <p className="text-sm text-zinc-400">No running order has been saved yet.</p>}
    {entries.map((entry,index)=><fieldset key={entry.id} className="space-y-3 rounded-lg border border-white/10 p-3">
      <legend className="px-1 font-semibold">{index+1}. {timeline[index]?.plannedStart ?? "Time unavailable"} · {entry.title || "New item"}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs">Item {index+1} type<select disabled={!editable||pending} value={entry.kind} onChange={event=>{const kind=event.target.value as ServiceOrderEntry["kind"];edit(entry.id,{kind,slot_id:kind==="song"?(songs[0]?.id??null):null});}} className={field}>{["song","prayer","reading","announcement","media","other"].map(kind=><option key={kind} value={kind}>{kind}</option>)}</select></label>
        <label className="grid gap-1 text-xs">Item {index+1} title<input disabled={!editable||pending} maxLength={160} value={entry.title} onChange={event=>edit(entry.id,{title:event.target.value})} className={field}/></label>
        {entry.kind==="song"&&<label className="grid gap-1 text-xs">Item {index+1} setlist song<select disabled={!editable||pending} value={entry.slot_id??""} onChange={event=>edit(entry.id,{slot_id:event.target.value||null,title:songs.find(song=>song.id===event.target.value)?.title??entry.title})} className={field}><option value="">Choose linked song</option>{songs.map(song=><option key={song.id} value={song.id}>{song.title}</option>)}</select></label>}
        <label className="grid gap-1 text-xs">Item {index+1} duration (minutes)<input type="number" min={0} max={120} step={0.5} disabled={!editable||pending} value={entry.duration_seconds/60} onChange={event=>edit(entry.id,{duration_seconds:Math.max(0,Math.min(7200,Math.round((Number(event.target.value)||0)*60)))})} className={field}/></label>
        <label className="grid gap-1 text-xs">Item {index+1} responsible person<select disabled={!editable||pending} value={entry.responsible_member_id??""} onChange={event=>edit(entry.id,{responsible_member_id:event.target.value||null})} className={field}><option value="">Unassigned</option>{workspace.members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      </div>
      <label className="grid gap-1 text-xs">Item {index+1} production cue<textarea disabled={!editable||pending} maxLength={2000} value={entry.cue} onChange={event=>edit(entry.id,{cue:event.target.value})} className={`${field} py-2`}/></label>
      {editable&&<div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={pending||index===0} aria-label={`Move item ${index+1} up`} onClick={()=>move(index,-1)}>Move up</Button><Button variant="secondary" type="button" disabled={pending||index===entries.length-1} aria-label={`Move item ${index+1} down`} onClick={()=>move(index,1)}>Move down</Button><Button variant="danger" type="button" disabled={pending} aria-label={`Remove item ${index+1}`} onClick={()=>{setEntries(current=>current.filter(row=>row.id!==entry.id));setNonce(null);}}>Remove</Button></div>}
    </fieldset>)}
    {editable&&<Button type="button" variant="secondary" disabled={pending||entries.length>=200} onClick={()=>{setEntries(current=>[...current,{id:crypto.randomUUID(),kind:"other",title:"",slot_id:null,duration_seconds:60,responsible_member_id:null,cue:""}]);setNonce(null);}}>Add order item</Button>}
    <div className="space-y-3 border-t border-white/10 pt-4">
      <h3 className="font-semibold">Required roles</h3>
      {editable&&workspace.templates.length>0&&<label className="grid gap-1 text-sm">Use roles from a service template<select className={field} defaultValue="" disabled={pending} onChange={event=>{const template=workspace.templates.find(row=>row.id===event.target.value);if(template){setRequiredRoles(requiredRolesFromTemplate(template.default_roles));setNonce(null);}}}><option value="">Choose template</option>{workspace.templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">Required roles, one per line<textarea disabled={!editable||pending} value={requiredRoles.join("\n")} onChange={event=>{setRequiredRoles(event.target.value.split("\n"));setNonce(null);}} className={`${field} min-h-24 py-2`}/></label>
      <p className="text-sm text-amber-200">{missing.length?`Missing or declined roles: ${missing.filter(Boolean).join(", ")}`:requiredRoles.length?"All required roles have an assignment; pending confirmations still need a response.":"Choose required roles to check roster gaps."}</p>
    </div>
    {!canManage&&proposeAction&&<label className="grid gap-1 text-sm">Reason for requested changes<textarea maxLength={1000} value={reason} onChange={event=>{setReason(event.target.value);setNonce(null);}} className={`${field} py-2`}/></label>}
    <div className="flex flex-wrap gap-2">{editable&&<Button type="button" disabled={pending||(!canManage&&!reason.trim())} onClick={()=>void save()}>{pending?"Saving…":canManage?"Save service order":"Request order changes"}</Button>}<Button variant="secondary" type="button" onClick={download}>Download running order</Button><Button variant="secondary" type="button" disabled={pending} onClick={()=>void reload()}>Reload latest order (replace draft)</Button></div>
    <p role="status" className="text-sm text-violet-200">{status}</p>
    <div className="space-y-3 border-t border-white/10 pt-4"><h3 className="font-semibold">Assignment confirmations</h3><p className="text-sm text-zinc-400">Confirm each assigned role separately from your availability RSVP.</p>
      {workspace.assignments.length===0&&<p className="text-sm text-zinc-400">No roles assigned yet. An event leader can add them in Edit Event.</p>}
      {workspace.assignments.map(assignment=><AssignmentResponse key={assignment.id} assignment={assignment} name={names.get(assignment.team_member_id)??"Unavailable member"} own={assignment.team_member_id===memberId} response={responses.find(row=>row.assignment_id===assignment.id)} onSaved={response=>setResponses(current=>[...current.filter(row=>row.assignment_id!==response.assignment_id),response])}/>)}
    </div>
  </section>;
}
function AssignmentResponse({assignment,name,own,response,onSaved}:{assignment:WorkflowAssignment;name:string;own:boolean;response?:AssignmentResponseRow;onSaved:(row:AssignmentResponseRow)=>void}){
  const [state,setState]=useState<AssignmentState>(response?.state??"pending");
  const [note,setNote]=useState(response?.note??"");
  const [pending,setPending]=useState(false);
  const [status,setStatus]=useState("");
  async function save(){setPending(true);try{const result=await respondAssignmentAction({assignmentId:assignment.id,state,note});setStatus(result.message);if(result.ok)onSaved({assignment_id:assignment.id,team_member_id:assignment.team_member_id,state,note,updated_at:new Date().toISOString()});}catch{setStatus("Response could not be saved. Keep your note and retry.");}finally{setPending(false);}}
  return <div className="space-y-2 rounded-lg border border-white/10 p-3"><p className="font-semibold">{assignment.assignment} · {name}</p><p className="text-sm text-zinc-400">Saved response: {response?.state??"pending"}</p>{own&&<><label className="grid gap-1 text-sm">Your {assignment.assignment} response<select className={field} disabled={pending} value={state} onChange={event=>setState(event.target.value as AssignmentState)}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option></select></label><label className="grid gap-1 text-sm">Note for {assignment.assignment}<textarea className={`${field} py-2`} disabled={pending} maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label><Button type="button" disabled={pending} onClick={()=>void save()}>{pending?"Saving…":`Save ${assignment.assignment} response`}</Button><p role="status" className="text-sm text-violet-200">{status}</p></>}</div>;
}
