import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { mobileMessageThreadPageSchema,mobileMessageThreadQuerySchema,assertMobileMessageThreadPage,type MobileMessageCursor } from './messages';
export const mobileMessageSearchTermSchema=z.string().trim().min(1).max(80);
export const mobileMessageSearchQuerySchema=mobileMessageThreadQuerySchema.safeExtend({q:mobileMessageSearchTermSchema});
export const mobileMessageSearchPageSchema=mobileMessageThreadPageSchema.extend({query:mobileMessageSearchTermSchema});
export type MobileMessageSearchPage=z.infer<typeof mobileMessageSearchPageSchema>;
export function assertMobileMessageSearchPage(identity:MobileIdentity,channelId:string,query:string,before:MobileMessageCursor|null,value:unknown):MobileMessageSearchPage{
  const result=mobileMessageSearchPageSchema.parse(value);const {query:actual,...page}=result;
  assertMobileMessageThreadPage(identity,channelId,before,page);
  if(actual!==mobileMessageSearchTermSchema.parse(query))throw new Error('Search proof belongs to another phrase.');return result;
}
