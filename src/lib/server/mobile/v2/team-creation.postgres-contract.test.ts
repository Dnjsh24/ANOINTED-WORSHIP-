// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it,vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileTeamCreationRequestSchema,mobileTeamCreationReceiptSchema,assertMobileTeamCreationReceipt } from '@/lib/mobile/v2/team-creation';
vi.mock('server-only',()=>({}));
import { applyMobileTeamCreation } from './team-creation';
const evidencePath=process.env.MOBILE_TEAM_CREATION_PG_CASES;
it.skipIf(!evidencePath)('validates actual atomic bootstrap and private terminal collision receipts',async()=>{
  if(!evidencePath)throw new Error('Set MOBILE_TEAM_CREATION_PG_CASES to actual disposable PostgreSQL evidence.');
  const cases=z.array(z.object({request:mobileTeamCreationRequestSchema,receipt:mobileTeamCreationReceiptSchema}).strict()).parse(JSON.parse(readFileSync(evidencePath,'utf8').replace(/^\uFEFF/,'')));
  expect(cases).toHaveLength(3);expect(cases.filter(row=>row.receipt.status==='applied')).toHaveLength(1);expect(cases.filter(row=>row.receipt.status==='blocked')).toHaveLength(2);
  for(const {request,receipt} of cases){expect(assertMobileTeamCreationReceipt(request.userId,request,receipt)).toEqual(receipt);const client={rpc:vi.fn(async()=>({data:receipt,error:null}))} as unknown as SupabaseClient<Database>;expect(await applyMobileTeamCreation({client,userId:request.userId,request})).toEqual(receipt);}
});
