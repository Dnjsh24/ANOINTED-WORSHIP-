import { expect,it } from 'vitest';
import { mobileTeamCreationRequestSchema,assertMobileTeamCreationReceipt } from './team-creation';
import { teamCreationRequest as request,teamCreationReceipt as receipt } from './team-creation-test-fixture';
it('binds reviewed real fields and immutable applied/blocked bootstrap receipts',()=>{
  expect(assertMobileTeamCreationReceipt(request.userId,request,receipt)).toEqual(receipt);
  for(const value of [{...request,value:{...request.value,invites:[]}}, {...request,value:{...request.value,callTime:'25:00:00'}}, {...request,value:{...request.value,name:' Team '}}]) expect(mobileTeamCreationRequestSchema.safeParse(value).success).toBe(false);
  expect(assertMobileTeamCreationReceipt(request.userId,request,{...receipt,status:'blocked',workspace:null,reason:'existing_code'}).status).toBe('blocked');
  expect(()=>assertMobileTeamCreationReceipt(request.userId,request,{...receipt,workspace:{...receipt.workspace,name:'Different'}})).toThrow();
});
