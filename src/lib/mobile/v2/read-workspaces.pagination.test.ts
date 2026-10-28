// @vitest-environment node
import {createClient} from '@supabase/supabase-js';
import {expect,it} from 'vitest';
import type {Database} from '../../supabase/database.types';
import {readMobileWorkspaces,readSelectedWorkspace} from './read-workspaces';
import {mobileWorkspacesResponseSchema} from './workspaces';

const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1);
const member=(n:number)=>({id:id(n+1000),team_id:id(n),profile_id:userId,role:'member',status:'active',custom_role_id:null,custom_roles:null,teams:{name:`Team ${n}`}});
type Row=Record<string,unknown>;
function fixture(cap:number,count=121,fail?:(table:string,after:string|null)=>'error'|'repeat'|'foreign'|undefined){
  const memberships=Array.from({length:count},(_,n)=>member(n+10));
  const overrides=memberships.flatMap((row,n)=>[
    {id:id(n+2000),team_id:row.team_id,role:'member',member_id:null,permission:'files.upload',allowed:true},
    {id:id(n+3000),team_id:row.team_id,role:null,member_id:row.id,permission:'files.upload',allowed:false},
  ]).sort((a,b)=>a.id.localeCompare(b.id));
  const client=createClient<Database>('https://pagination.supabase.co','publishable-fixture',{auth:{persistSession:false},global:{fetch:async input=>{
    const url=new URL(String(input));const table=url.pathname.split('/').at(-1)!;
    const key=table==='team_members'?'team_id':'id';
    const filter=url.searchParams.get(key);const after=filter?.startsWith('gt.')?filter.slice(3):null;
    const fault=fail?.(table,after);
    // A denied query is a terminal SDK response, unlike a 503 that the SDK retries with backoff.
    if(fault==='error')return new Response(JSON.stringify({code:'42501',message:'Read failed'}),{status:403,headers:{'Content-Type':'application/json'}});
    let rows:Row[]=table==='team_members'?memberships:table==='team_permission_overrides'?overrides:[];
    const teams=url.searchParams.get('team_id');
    if(teams?.startsWith('in.(')){const ids=teams.slice(4,-1).split(',');rows=rows.filter(row=>ids.includes(String(row.team_id)));}
    else if(teams?.startsWith('eq.'))rows=rows.filter(row=>row.team_id===teams.slice(3));
    if(after&&fault!=='repeat')rows=rows.filter(row=>String(row[key])>after);
    rows=rows.slice(0,Math.min(cap,Number(url.searchParams.get('limit')??cap)));
    if(fault==='foreign'&&rows.length)rows=[{...rows[0],profile_id:id(99)}];
    const data=url.searchParams.get('select')?.includes('teams(name)')&&teams?.startsWith('eq.')?rows[0]??null:rows;
    return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  }}});
  return {client,userId,memberships};
}
it.each([1,7,50,51])('keeps the 50-row wire contract and complete catalog/late denies under server cap %i',async cap=>{
  const db=fixture(cap);const all=[];let after:string|undefined;
  do{
    const page=mobileWorkspacesResponseSchema.parse(await readMobileWorkspaces({...db,input:{version:2,...(after?{after}:{})}}));
    if(page.nextId!==null)expect(page.memberships).toHaveLength(50);
    all.push(...page.memberships);after=page.nextId??undefined;
  }while(after);
  expect(all.map(row=>row.teamId)).toEqual(db.memberships.map(row=>row.team_id));
  expect(new Set(all.map(row=>row.teamId)).size).toBe(121);
  expect(all.every(row=>!row.permissions.includes('files.upload'))).toBe(true);
});
it('does not fabricate another page for an exact full final page under cap 1',async()=>{
  const db=fixture(1,50);const page=await readMobileWorkspaces({...db,input:{version:2}});
  expect(page.memberships).toHaveLength(50);expect(page.nextId).toBeNull();
});
it('retains a person deny behind the first capped role allow for explicit team selection',async()=>{
  const db=fixture(1,1);
  const selected=await readSelectedWorkspace({...db,teamId:id(10)});
  expect(selected.permissions).not.toContain('files.upload');
});
it.each(['error','repeat','foreign'] as const)('fails closed after partial membership pages when a later row is %s',async fault=>{
  const db=fixture(1,3,(table,after)=>table==='team_members'&&after?fault:undefined);
  await expect(readMobileWorkspaces({...db,input:{version:2}})).rejects.toMatchObject({status:503});
});
it.each(['error','repeat'] as const)('never returns partial grants when a later override page is %s',async fault=>{
  const db=fixture(1,1,(table,after)=>table==='team_permission_overrides'&&after?fault:undefined);
  await expect(readSelectedWorkspace({...db,teamId:id(10)})).rejects.toMatchObject({status:503});
});
