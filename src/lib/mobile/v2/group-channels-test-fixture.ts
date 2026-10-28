import { messageSendIdentity,messageSendRequest,messageSendId } from './message-send-test-fixture';
import type { MobileGroupChannelRequest } from './group-channels';
export const groupChannelIdentity={...messageSendIdentity,role:'owner' as const};
export const groupChannelSnapshot={id:messageSendId(400),teamId:messageSendIdentity.teamId,name:'Choir group',createdBy:messageSendIdentity.userId,createdAt:'2026-10-24T02:00:00Z'};
export const groupChannelOwnJoin={id:messageSendId(401),channelId:groupChannelSnapshot.id,memberId:messageSendIdentity.memberId,createdAt:'2026-10-24T02:00:00Z'};
const common={version:2 as const,userId:messageSendIdentity.userId,teamId:messageSendIdentity.teamId,memberId:messageSendIdentity.memberId,memberCreatedAt:messageSendRequest.memberCreatedAt,requestNonce:messageSendId(402)};
export const groupChannelCreateRequest:MobileGroupChannelRequest={...common,operation:'create',value:{name:'Choir group'}};
export const groupChannelLeaveRequest:MobileGroupChannelRequest={...common,operation:'leave',channel:groupChannelSnapshot,baseJoin:groupChannelOwnJoin};
export const groupChannelReceipt={version:2 as const,request:groupChannelCreateRequest,status:'applied' as const,channelId:groupChannelSnapshot.id,joinId:groupChannelOwnJoin.id,recordedAt:'2026-10-24T02:00:00Z'};
