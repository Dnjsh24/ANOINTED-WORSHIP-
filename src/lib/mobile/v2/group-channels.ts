import { z } from 'zod';
import { mobileIdentitySchema,type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
import { assertMessageSendScope } from './message-send';
export const MOBILE_GROUP_CHANNEL_MAX_BYTES=16384;
const time=z.iso.datetime({offset:true}).refine(value=>(value.match(/\.(\d+)/)?.[1].length??0)<=6);
export const mobileGroupChannelSchema=z.object({id:z.uuid(),teamId:z.uuid(),name:z.string().min(1).max(500),createdBy:z.uuid(),createdAt:time}).strict();
export type MobileGroupChannel=z.infer<typeof mobileGroupChannelSchema>;
export const mobileGroupTargetSchema=z.object({memberId:z.uuid(),profileId:z.uuid(),status:z.enum(['active','inactive']),createdAt:time}).strict();
export type MobileGroupTarget=z.infer<typeof mobileGroupTargetSchema>;
export const mobileGroupJoinSchema=z.object({id:z.uuid(),channelId:z.uuid(),memberId:z.uuid(),createdAt:time}).strict();
export type MobileGroupJoin=z.infer<typeof mobileGroupJoinSchema>;
const common={version:z.literal(2),userId:z.uuid(),teamId:z.uuid(),memberId:z.uuid(),memberCreatedAt:time,requestNonce:z.uuid()};
export const mobileGroupChannelRequestSchema=z.discriminatedUnion('operation',[
 z.object({...common,operation:z.literal('create'),value:z.object({name:z.string().trim().min(1).max(80)}).strict()}).strict(),
 z.object({...common,operation:z.literal('add'),channel:mobileGroupChannelSchema,target:mobileGroupTargetSchema,baseJoin:z.null()}).strict(),
 z.object({...common,operation:z.literal('remove'),channel:mobileGroupChannelSchema,target:mobileGroupTargetSchema,baseJoin:mobileGroupJoinSchema}).strict(),
 z.object({...common,operation:z.literal('leave'),channel:mobileGroupChannelSchema,baseJoin:mobileGroupJoinSchema}).strict(),
]).refine(value=>value.operation==='create'||value.channel.teamId===value.teamId&&(value.operation==='add'?value.target.status==='active':value.baseJoin.channelId===value.channel.id&&value.baseJoin.memberId===(value.operation==='leave'?value.memberId:value.target.memberId))&&(value.operation!=='remove'||value.target.memberId!==value.memberId&&value.target.profileId!==value.userId),'Use the exact selected group and membership.');
export type MobileGroupChannelRequest=z.infer<typeof mobileGroupChannelRequestSchema>;
export const mobileGroupChannelReceiptSchema=z.object({version:z.literal(2),request:mobileGroupChannelRequestSchema,status:z.enum(['applied','conflict','missing']),channelId:z.uuid(),joinId:z.uuid().nullable(),recordedAt:time}).strict().refine(value=>(value.request.operation!=='create'||value.status==='applied')&&(value.request.operation==='create'||value.channelId===value.request.channel.id)&&(value.status==='applied'&&['create','add'].includes(value.request.operation)?value.joinId!==null:value.joinId===null),'The receipt must describe the exact group operation.');
export type MobileGroupChannelReceipt=z.infer<typeof mobileGroupChannelReceiptSchema>;
const envelope={version:z.literal(2),identity:mobileIdentitySchema,memberCreatedAt:time,fetchedAt:time};
export const mobileGroupCatalogSchema=z.object({...envelope,items:z.array(mobileGroupChannelSchema).max(50),after:z.uuid().nullable(),nextCursor:z.uuid().nullable()}).strict();
export type MobileGroupCatalog=z.infer<typeof mobileGroupCatalogSchema>;
const person=z.object({target:mobileGroupTargetSchema,displayName:z.string().max(500).nullable()}).strict();
export const mobileGroupPeopleSchema=z.object({...envelope,items:z.array(person).max(50),after:z.uuid().nullable(),nextCursor:z.uuid().nullable()}).strict();
export type MobileGroupPeople=z.infer<typeof mobileGroupPeopleSchema>;
export const mobileGroupStateSchema=z.object({...envelope,channel:mobileGroupChannelSchema,ownJoin:mobileGroupJoinSchema.nullable(),members:z.object({items:z.array(z.object({join:mobileGroupJoinSchema,person}).strict()).max(50),after:z.uuid().nullable(),nextCursor:z.uuid().nullable()}).strict().nullable()}).strict();
export type MobileGroupState=z.infer<typeof mobileGroupStateSchema>;
export const mobileGroupOwnMembershipSchema=z.object({version:z.literal(2),identity:mobileIdentitySchema,channelId:z.uuid(),current:mobileGroupJoinSchema.nullable(),fetchedAt:time}).strict();
export type MobileGroupOwnMembership=z.infer<typeof mobileGroupOwnMembershipSchema>;
export function assertGroupScope(identity:MobileIdentity,request:Pick<MobileGroupChannelRequest,'userId'|'teamId'|'memberId'>=identity,manager=false){assertMessageSendScope(identity,request);if(manager&&!['owner','admin'].includes(identity.role))throw new Error('Current owner or admin required for group management.');}
export function assertMobileGroupChannelReceipt(identity:MobileIdentity,request:MobileGroupChannelRequest,value:unknown):MobileGroupChannelReceipt{request=mobileGroupChannelRequestSchema.parse(request);assertGroupScope(identity,request,request.operation!=='leave');const result=mobileGroupChannelReceiptSchema.parse(value);if(JSON.stringify(result.request)!==JSON.stringify(request))throw new Error('Group receipt differs from the saved operation.');return result;}
function page(ids:string[],after:string|null,next:string|null){if(ids.some((id,index)=>after!==null&&id<=after||index>0&&id<=ids[index-1])||next!==null&&(ids.length!==50||next!==ids.at(-1)))throw new Error('Group page ordering differs.');}
export function assertMobileGroupCatalog(identity:MobileIdentity,after:string|null,value:unknown):MobileGroupCatalog{const result=mobileGroupCatalogSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertGroupScope(identity,identity,true);if(result.after!==after||result.items.some(row=>row.teamId!==identity.teamId))throw new Error('Group catalog scope differs.');page(result.items.map(row=>row.id),after,result.nextCursor);return result;}
export function assertMobileGroupPeople(identity:MobileIdentity,after:string|null,value:unknown):MobileGroupPeople{const result=mobileGroupPeopleSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertGroupScope(identity,identity,true);if(result.after!==after||result.items.some(row=>row.target.status!=='active'))throw new Error('Group people scope differs.');page(result.items.map(row=>row.target.memberId),after,result.nextCursor);return result;}
export function assertMobileGroupOwnMembership(identity:MobileIdentity,channelId:string,value:unknown):MobileGroupOwnMembership{const result=mobileGroupOwnMembershipSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertGroupScope(identity);if(result.channelId!==channelId||result.current&&(result.current.channelId!==channelId||result.current.memberId!==identity.memberId))throw new Error('Own group membership scope differs.');return result;}
export function assertMobileGroupState(identity:MobileIdentity,channelId:string,after:string|null,value:unknown):MobileGroupState{const result=mobileGroupStateSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertGroupScope(identity);if(result.channel.id!==channelId||result.channel.teamId!==identity.teamId||result.ownJoin&&(result.ownJoin.channelId!==channelId||result.ownJoin.memberId!==identity.memberId))throw new Error('Group state scope differs.');if(!['owner','admin'].includes(identity.role)){if(result.members!==null||!result.ownJoin||after!==null)throw new Error('Only joined own group state is available.');}else{if(!result.members||result.members.after!==after||result.members.items.some(row=>row.join.channelId!==channelId||row.join.memberId!==row.person.target.memberId))throw new Error('Group membership page differs.');page(result.members.items.map(row=>row.join.id),after,result.members.nextCursor);}return result;}
