import { canonicalEventSnapshot, mobileEventSnapshotSchema } from './event-commands';
import { eventEditorContextSchema, eventEditorMemberSchema, eventEditorSetlistSchema, eventEditorTemplateSchema, type EventEditorContext } from './event-editor-context';
import { mobileEventAssignmentSchema, mobileEventRowSchema, type MobileEventGraph } from './event-read-models';
import { EventReadError, eventReadColumns, readEventPages, verifyEventReadAccess, type ReadEventsOptions } from './read-events';

/** Complete editor bases are additive: old event caches remain readable during upgrades. */
export async function readEventEditorContext(options:ReadEventsOptions):Promise<EventEditorContext>{
  const pageSize=options.pageSize??100;
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500)throw new EventReadError('Event editor page size must be between 1 and 500.');
  const verified=await verifyEventReadAccess(options,pageSize);
  const {identity,permissions,role}=verified;
  if(!permissions.canManage&&!permissions.canRequest)throw new EventReadError('This account cannot edit or request events.',403);
  const {client,signal}=options;
  const members=await readEventPages(eventEditorMemberSchema,row=>row.id,after=>{
    let query=client.from('team_members').select('id,team_id,profile_id,role,status,ministry,ministries,created_at,profiles(id,full_name,email)').eq('team_id',identity.teamId).eq('status','active').order('id').limit(pageSize);
    if(after)query=query.gt('id',after);return signal?query.abortSignal(signal):query;
  },pageSize,signal);
  const templates=await readEventPages(eventEditorTemplateSchema,row=>row.id,after=>{
    let query=client.from('service_templates').select('id,team_id,name,service_type,location,call_time,rehearsal_time,reminder_frequency,reminder_occurrences,default_roles,created_at').eq('team_id',identity.teamId).order('id').limit(pageSize);
    if(after)query=query.gt('id',after);return signal?query.abortSignal(signal):query;
  },pageSize,signal);
  const setlists=await readEventPages(eventEditorSetlistSchema,row=>row.id,after=>{
    let query=client.from('setlists').select('id,team_id,name,setlist_date,event_id,sync_revision,deleted_at').eq('team_id',identity.teamId).is('deleted_at',null).order('id').limit(pageSize);
    if(after)query=query.gt('id',after);return signal?query.abortSignal(signal):query;
  },pageSize,signal);
  const events=await readEventPages(mobileEventRowSchema,row=>row.id,after=>{
    let query=client.from('events').select(eventReadColumns).eq('team_id',identity.teamId).is('deleted_at',null).order('id').limit(pageSize);
    if(after)query=query.gt('id',after);return signal?query.abortSignal(signal):query;
  },pageSize,signal);
  if(events.some(row=>row.team_id!==identity.teamId||(row.approval_status!=='approved'&&row.created_by!==identity.userId&&role!=='owner'&&role!=='admin')))throw new EventReadError('An event editor base is not visible to this account.',403);
  const assignments:MobileEventGraph['assignments']=[];
  for(let start=0;start<events.length;start+=50){
    const eventIds=events.slice(start,start+50).map(row=>row.id);
    const rows=await readEventPages(mobileEventAssignmentSchema,row=>row.id,after=>{
      let query=client.from('event_assignments').select('id,event_id,team_member_id,assignment,created_at').in('event_id',eventIds).order('id').limit(pageSize);
      if(after)query=query.gt('id',after);return signal?query.abortSignal(signal):query;
    },pageSize,signal);
    if(rows.some(row=>!eventIds.includes(row.event_id)))throw new EventReadError('An event editor assignment has a different parent.');
    assignments.push(...rows);
  }
  const snapshots=events.map(record=>canonicalEventSnapshot(mobileEventSnapshotSchema.parse({record,
    assignments:record.approval_status==='pending'?record.requested_assignments:assignments.filter(row=>row.event_id===record.id).map(({team_member_id,assignment})=>({team_member_id,assignment})),
    linkedSetlists:setlists.filter(row=>row.event_id===record.id).map(row=>({id:row.id,revision:row.sync_revision})),
  })));
  const current=await verifyEventReadAccess(options,pageSize);
  if(current.fingerprint!==verified.fingerprint)throw new EventReadError('Workspace permissions changed while preparing the event editor.',403);
  const checked=eventEditorContextSchema.safeParse({version:1,authorization:verified.authorization,members,templates,setlists,snapshots});
  if(!checked.success)throw new EventReadError('Event editor context could not be verified. Existing drafts remain saved.');
  return checked.data;
}
