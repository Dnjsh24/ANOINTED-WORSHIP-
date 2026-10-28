import { expect,it } from 'vitest';
import { mobileMessageThreadQuerySchema,assertMobileMessageThreadPage } from './messages';
import { profileAvatarIdentity as identity } from './profile-avatar-test-fixture';
it('requires exact safe cursor pairs and own chronological channel-scoped messages',()=>{
  const id='99940000-0000-4000-8000-000000000001';const time='2026-10-23T04:00:00.123456Z';
  expect(mobileMessageThreadQuerySchema.safeParse({beforeCreatedAt:time}).success).toBe(false);expect(mobileMessageThreadQuerySchema.safeParse({beforeCreatedAt:'evil),id.gt.any',beforeId:id}).success).toBe(false);
  const result={version:2,identity,channel:{id,teamId:identity.teamId,name:'Actual channel',type:'direct',updatedAt:time},items:[],before:null,nextCursor:null,fetchedAt:time};
  expect(assertMobileMessageThreadPage(identity,id,null,result)).toEqual(result);
  expect(()=>assertMobileMessageThreadPage(identity,id,null,{...result,channel:{...result.channel,teamId:id}})).toThrow();
});
