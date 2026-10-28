// @vitest-environment node
import { expect,it,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { teamCreationRequest as request,teamCreationReceipt as receipt,teamCreationId as id } from '@/lib/mobile/v2/team-creation-test-fixture';
vi.mock('server-only',()=>({}));
import { applyMobileTeamCreation } from './team-creation';
it('requires original account, validates history and retains uncertain creation without generating a replacement',async()=>{
  const rpc=vi.fn(async()=>({data:receipt,error:null}));const client={rpc} as unknown as SupabaseClient<Database>;
  expect(await applyMobileTeamCreation({client,userId:request.userId,request})).toEqual(receipt);expect(rpc).toHaveBeenCalledWith('mobile_create_team_workspace',{p_request:request});
  await expect(applyMobileTeamCreation({client,userId:id(99),request})).rejects.toMatchObject({status:403});
  for(const [code,status] of [['22023',409],['42501',403],['P0001',503]] as const){const db={rpc:async()=>({data:null,error:{code,message:'private SQL'}})} as unknown as SupabaseClient<Database>;await expect(applyMobileTeamCreation({client:db,userId:request.userId,request})).rejects.toMatchObject({status,message:expect.not.stringContaining('private SQL')});}
});
