import { z } from 'zod';
import { teamRoles, type TeamMember } from '@/lib/types';
import { permissionValues } from '@/lib/domain/wooly-permissions';
import { fallbackServiceTemplates, mapServiceTemplate } from '@/lib/domain/service-templates';
import { mapEventAssignments } from '@/lib/domain/event-workflows';
import { mobileEventSnapshotSchema } from './event-commands';

const timestamp=z.iso.datetime({offset:true});
export const eventEditorMemberSchema=z.object({id:z.uuid(),team_id:z.uuid(),profile_id:z.uuid(),role:z.enum(teamRoles),status:z.literal('active'),
  ministry:z.string().nullable(),ministries:z.array(z.string()).nullable(),created_at:timestamp,
  profiles:z.object({id:z.uuid(),full_name:z.string().nullable(),email:z.string().nullable()}).strict().nullable(),
}).strict().refine(row=>row.profiles===null||row.profiles.id===row.profile_id);
export const eventEditorTemplateSchema=z.object({id:z.uuid(),team_id:z.uuid(),name:z.string(),service_type:z.string(),location:z.string(),
  call_time:z.string(),rehearsal_time:z.string(),reminder_frequency:z.string(),reminder_occurrences:z.number().int(),default_roles:z.json(),created_at:timestamp,
}).strict();
export const eventEditorSetlistSchema=z.object({id:z.uuid(),team_id:z.uuid(),name:z.string(),setlist_date:z.iso.date(),event_id:z.uuid().nullable(),
  sync_revision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),deleted_at:z.null(),
}).strict();
export const eventEditorContextSchema=z.object({version:z.literal(1),authorization:z.object({userId:z.uuid(),teamId:z.uuid(),memberId:z.uuid(),role:z.enum(teamRoles),permissions:z.array(z.enum(permissionValues))}).strict(),
  members:z.array(eventEditorMemberSchema),templates:z.array(eventEditorTemplateSchema),setlists:z.array(eventEditorSetlistSchema),snapshots:z.array(mobileEventSnapshotSchema),
}).strict().superRefine((context,validation)=>{
  const teamId=context.authorization.teamId;
  for(const rows of [context.members,context.templates,context.setlists]){
    if(rows.some(row=>row.team_id!==teamId)||new Set(rows.map(row=>row.id)).size!==rows.length)validation.addIssue({code:'custom',message:'Editor data belongs to another workspace or repeats a row.'});
  }
  if(new Set(context.snapshots.map(snapshot=>snapshot.record.id)).size!==context.snapshots.length)validation.addIssue({code:'custom',message:'Editor event snapshots repeat a row.'});
  for(const snapshot of context.snapshots){
    if(snapshot.record.team_id!==teamId||snapshot.record.deleted_at!==null)validation.addIssue({code:'custom',message:'Editor event base is unavailable.'});
    if(snapshot.record.approval_status!=='approved'&&snapshot.record.created_by!==context.authorization.userId&&!['owner','admin'].includes(context.authorization.role))validation.addIssue({code:'custom',message:'Editor event base is private to another account.'});
    const links=context.setlists.filter(row=>row.event_id===snapshot.record.id).map(row=>({id:row.id,revision:row.sync_revision})).sort((a,b)=>a.id.localeCompare(b.id));
    if(JSON.stringify(links)!==JSON.stringify([...snapshot.linkedSetlists].sort((a,b)=>a.id.localeCompare(b.id))))validation.addIssue({code:'custom',message:'Editor linked setlist revisions do not match their saved rows.'});
  }
});
export type EventEditorContext=z.infer<typeof eventEditorContextSchema>;

/** Actual website form projections; revisions stay in the separate captured context. */
export function eventEditorOptions(input:EventEditorContext,eventId?:string,today=new Date().toISOString().slice(0,10)){
  const context=eventEditorContextSchema.parse(input);
  const snapshot=eventId?context.snapshots.find(row=>row.record.id===eventId):undefined;
  if(eventId&&!snapshot)throw new Error('Download this event’s current editor data before editing.');
  const permissions=context.authorization.permissions;
  if(eventId?!permissions.includes('events.manage'):!permissions.includes('events.manage')&&!permissions.includes('events.request'))throw new Error('This account cannot edit or request this event.');
  if(snapshot&&snapshot.record.approval_status!=='approved'&&!['owner','admin'].includes(context.authorization.role))throw new Error('Only an owner or admin can edit an event request.');
  const members:TeamMember[]=[...context.members].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)).map(row=>({
    id:row.id,profile:{id:row.profile_id,fullName:row.profiles?.full_name??'Unknown',email:row.profiles?.email??''},role:row.role,status:row.status,
    attendanceRate:0,ministry:row.ministry??'',ministries:row.ministries??(row.ministry?[row.ministry]:[]),
  }));
  const canLinkSetlists=permissions.includes('events.manage')&&permissions.includes('setlists.manage')&&(!snapshot||snapshot.record.approval_status==='approved');
  const templates=[...context.templates].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  const assignments=snapshot?.assignments??[];
  const liveAssignments=snapshot?.record.approval_status==='pending'?[]:assignments;
  const assigned=liveAssignments.length?liveAssignments.map(row=>row.assignment):snapshot?.record.description?.split(',').map(value=>value.trim()).filter(Boolean)??[];
  const record=snapshot?.record;
  return {teamMembers:members,serviceTemplates:templates.length?templates.map(mapServiceTemplate):fallbackServiceTemplates,
    requiresApproval:!permissions.includes('events.manage'),canLinkSetlists,
    setlists:canLinkSetlists?context.setlists.filter(row=>row.setlist_date>=today).sort((a,b)=>a.setlist_date.localeCompare(b.setlist_date)||a.id.localeCompare(b.id)).map(row=>({id:row.id,name:row.name,date:row.setlist_date})):[],
    revision:record?.sync_revision??0,initialAssignments:mapEventAssignments(assignments),
    initialEvent:record?{id:record.id,name:record.name,type:record.type,date:record.event_date,startTime:record.starts_at.slice(0,5),endTime:record.ends_at?.slice(0,5)??'',
      rehearsalDate:record.rehearsal_date??'',rehearsalStartTime:record.rehearsal_time?.slice(0,5)??'',rehearsalEndTime:record.rehearsal_end_time?.slice(0,5)??'',location:record.location??'Main Sanctuary',
      assignedTeams:assigned.length?assigned:['Worship Band'],notes:record.description===assigned.join(', ')?'':record.description??'',linkedSetlistId:snapshot?.linkedSetlists[0]?.id??''}:undefined,
  };
}
