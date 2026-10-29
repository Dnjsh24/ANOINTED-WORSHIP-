// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixture, server, identity, id, timestamp, type Row } from './event-read-test-fixture';
import { readEventEditorContext } from './read-event-editor';
import { eventEditorContextSchema, eventEditorOptions } from './event-editor-context';

function editorFixture():Record<string,Row[]>{
  const data=fixture();
  data.team_members[0]={...data.team_members[0],ministry:'Band',ministries:['Band','Media'],created_at:timestamp,
    profiles:{id:identity.userId,full_name:'Worship leader',email:'fixture@example.test'}};
  data.team_members.push({...data.team_members[0],id:id(80),profile_id:id(81),role:'band_member',profiles:{id:id(81),full_name:'Keys player',email:null}});
  data.service_templates[0]={...data.service_templates[0],service_type:'Sunday worship',location:'Chapel',call_time:'08:00',rehearsal_time:'08:30',reminder_frequency:'weekly',reminder_occurrences:4,default_roles:{mainKeys:id(80)},created_at:timestamp};
  data.setlists[0]={...data.setlists[0],name:'Linked previous service',setlist_date:'2026-01-01',sync_revision:15};
  data.setlists.push({...data.setlists[0],id:id(41),name:'Upcoming setlist',setlist_date:'2026-10-18',event_id:null,sync_revision:9});
  data.events[2]={...data.events[2],requested_assignments:[{team_member_id:id(80),assignment:'Main Keys'}],sync_revision:12};
  return data;
}
describe('complete authenticated offline event editor context',()=>{
  it('reads capped pages, real ministries/profiles/templates and exact linked revisions including past setlists',async()=>{
    const {client,urls,authHeaders}=server(editorFixture(),{cap:1});
    const context=await readEventEditorContext({client,identity,accessToken:'verified-token',pageSize:2});
    expect(context.members).toHaveLength(2);expect(context.snapshots).toHaveLength(4);
    expect(context.snapshots[0].linkedSetlists).toEqual([{id:id(40),revision:15}]);
    expect(context.snapshots[2]).toMatchObject({record:{sync_revision:12},assignments:[{team_member_id:id(80),assignment:'Main Keys'}]});
    const options=eventEditorOptions(context,id(10),'2026-10-16');
    expect(options).toMatchObject({revision:1,canLinkSetlists:true,requiresApproval:false,initialEvent:{id:id(10),linkedSetlistId:id(40)},initialAssignments:{media:identity.memberId},setlists:[{id:id(41),name:'Upcoming setlist',date:'2026-10-18'}]});
    expect(options.teamMembers[0]).toMatchObject({profile:{fullName:'Worship leader',email:'fixture@example.test'},ministry:'Band',ministries:['Band','Media']});
    expect(options.serviceTemplates[0]).toMatchObject({location:'Chapel',callTime:'08:00',reminderOccurrences:4,defaultRoles:{mainKeys:id(80)}});
    expect(authHeaders).toEqual(['Bearer verified-token','Bearer verified-token']);
    expect(urls.some(url=>url.pathname.endsWith('/setlists')&&url.searchParams.get('id')===`gt.${id(41)}`)).toBe(true);
    expect(urls.filter(url=>url.pathname.startsWith('/rest/')).every(url=>!url.searchParams.has('offset')&&!url.searchParams.get('select')?.includes('*'))).toBe(true);
    expect(eventEditorContextSchema.parse(JSON.parse(JSON.stringify(context)))).toEqual(context);
  });
  it('retains website template defaults for an empty real catalog and gates request-only editors',async()=>{
    const data=editorFixture();data.service_templates=[];data.events=data.events.filter(row=>row.approval_status==='approved');
    const {client}=server(data,{role:'band_leader'});
    const context=await readEventEditorContext({client,identity});
    // band_leader is a request role by default, not an official-event manager.
    const options=eventEditorOptions(context,undefined,'2026-10-16');
    expect(options.requiresApproval).toBe(true);expect(options.canLinkSetlists).toBe(false);expect(options.setlists).toEqual([]);
    expect(options.serviceTemplates[0].id).toBe('template-sunday-morning');
    expect(()=>eventEditorOptions(context,id(10))).toThrow('cannot edit');
  });
  it('does not fabricate a missing event or a linked setlist base',async()=>{
    const {client}=server(editorFixture());const context=await readEventEditorContext({client,identity});
    expect(()=>eventEditorOptions(context,id(99))).toThrow('Download');
    const bad={...context,snapshots:context.snapshots.map((row,index)=>index?row:{...row,linkedSetlists:[{id:id(40),revision:0}]})};
    expect(eventEditorContextSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects unknown account, denied authority, foreign nested data and partial failures',async()=>{
    const wrong=server(editorFixture(),{userId:id(99)});
    await expect(readEventEditorContext({client:wrong.client,identity})).rejects.toMatchObject({status:401});
    const denied=server(editorFixture(),{role:'member'});
    await expect(readEventEditorContext({client:denied.client,identity})).rejects.toMatchObject({status:403});
    expect(denied.urls.some(url=>url.pathname.endsWith('/events'))).toBe(false);
    for(const table of ['team_members','service_templates','setlists','events','event_assignments']){
      const data=editorFixture();const broken=server(data,{mutate:(current,rows)=>current===table&&rows.length?rows.map(row=>({...row,...(table==='event_assignments'?{event_id:id(99)}:{team_id:id(99)})})):rows});
      await expect(readEventEditorContext({client:broken.client,identity})).rejects.toThrow();
    }
    const outage=server(editorFixture(),{failTable:'service_templates'});
    await expect(readEventEditorContext({client:outage.client,identity})).rejects.toMatchObject({status:503});
  });
  it('rejects permission changes during preparation and does not accept aborted or repeated pages',async()=>{
    const changed=server(editorFixture(),{mutate:(table,rows,call)=>table==='team_members'&&call>=2?rows.map(row=>({...row,role:'member'})):rows});
    await expect(readEventEditorContext({client:changed.client,identity})).rejects.toMatchObject({status:403});
    const repeated=server(editorFixture(),{cap:1,mutate:(table,rows)=>table==='setlists'&&rows[0]?.id===id(41)?[{...rows[0],id:id(40)}]:rows});
    await expect(readEventEditorContext({client:repeated.client,identity})).rejects.toThrow('did not advance');
    const controller=new AbortController();controller.abort();const aborted=server(editorFixture());
    await expect(readEventEditorContext({client:aborted.client,identity,signal:controller.signal})).rejects.toThrow();expect(aborted.urls).toEqual([]);
  });
});
