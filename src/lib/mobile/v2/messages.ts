import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
import { compareSupportReadMarkerTimes } from './support-read-marker';
const timestamp = z.iso.datetime({ offset: true }).refine(value => (value.match(/\.(\d+)/)?.[1].length ?? 0) <= 6);
export const mobileMessageCursorSchema = z.object({ createdAt: timestamp, id: z.uuid() }).strict();
export type MobileMessageCursor = z.infer<typeof mobileMessageCursorSchema>;
export const mobileMessageChannelSchema = z.object({ id: z.uuid(), teamId: z.uuid(), name: z.string().min(1).max(500), type: z.enum(['team','group','direct']), updatedAt: timestamp }).strict();
export type MobileMessageChannel = z.infer<typeof mobileMessageChannelSchema>;
export const mobileMessageSchema = z.object({ id: z.uuid(), channelId: z.uuid(), senderMemberId: z.uuid(), senderName: z.string().max(500).nullable(), body: z.string().min(1).max(2000),
  createdAt: timestamp, updatedAt: timestamp, parentMessageId: z.uuid().nullable(), attachmentFileId: z.uuid().nullable(), scheduledFor: timestamp.nullable(), isDelivered: z.literal(true) }).strict();
export type MobileMessage = z.infer<typeof mobileMessageSchema>;
export const mobileMessageChannelsQuerySchema = z.object({ after: z.uuid().optional() }).strict();
export const mobileMessageThreadQuerySchema = z.object({ beforeCreatedAt: timestamp.optional(), beforeId: z.uuid().optional() }).strict().refine(value => Boolean(value.beforeCreatedAt) === Boolean(value.beforeId), 'Supply both cursor fields.');
export const mobileMessageChannelsPageSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, items: z.array(mobileMessageChannelSchema).max(50), after: z.uuid().nullable(), nextCursor: z.uuid().nullable(), fetchedAt: timestamp }).strict();
export type MobileMessageChannelsPage = z.infer<typeof mobileMessageChannelsPageSchema>;
export const mobileMessageThreadPageSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, channel: mobileMessageChannelSchema, items: z.array(mobileMessageSchema).max(50), before: mobileMessageCursorSchema.nullable(), nextCursor: mobileMessageCursorSchema.nullable(), fetchedAt: timestamp }).strict();
export type MobileMessageThreadPage = z.infer<typeof mobileMessageThreadPageSchema>;
function compare(left: MobileMessageCursor,right: MobileMessageCursor) { return compareSupportReadMarkerTimes(left.createdAt,right.createdAt) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0); }
export function assertMobileMessageChannelsPage(identity: MobileIdentity, after: string | null, value: unknown): MobileMessageChannelsPage {
  const result=mobileMessageChannelsPageSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);
  if(result.after!==after || result.items.some((item,index)=>item.teamId!==identity.teamId || after!==null&&item.id<=after || index>0&&item.id<=result.items[index-1].id)
    || result.nextCursor!==null && (result.items.length!==50||result.nextCursor!==result.items.at(-1)?.id))throw new Error('Channel scope or ordering changed.');return result;
}
export function assertMobileMessageThreadPage(identity: MobileIdentity,channelId:string,before:MobileMessageCursor|null,value:unknown):MobileMessageThreadPage {
  const result=mobileMessageThreadPageSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);
  if(result.channel.id!==channelId||result.channel.teamId!==identity.teamId||JSON.stringify(result.before)!==JSON.stringify(before)
    ||result.items.some((item,index)=>item.channelId!==channelId||before!==null&&compare(item,before)>=0||index>0&&compare(result.items[index-1],item)>=0)
    ||result.nextCursor!==null&&(result.items.length!==50||!result.items.length||compare(result.nextCursor,result.items[0])!==0))throw new Error('Message scope or cursor changed.');return result;
}
