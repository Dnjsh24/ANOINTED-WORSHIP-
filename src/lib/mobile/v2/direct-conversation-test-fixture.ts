import { messageSendIdentity,messageSendRequest,messageSendId } from './message-send-test-fixture';
import type { MobileDirectConversationRequest } from './direct-conversation';
export const directConversationIdentity=messageSendIdentity;
export const directConversationRequest:MobileDirectConversationRequest={version:2,userId:messageSendIdentity.userId,teamId:messageSendIdentity.teamId,memberId:messageSendIdentity.memberId,memberCreatedAt:messageSendRequest.memberCreatedAt,requestNonce:messageSendId(300),target:{memberId:messageSendId(301),profileId:messageSendId(302),createdAt:'2026-10-24T00:00:00.123456Z'}};
export const directConversationReceipt={version:2 as const,request:directConversationRequest,status:'opened' as const,channelId:messageSendId(303),created:true,recordedAt:'2026-10-24T01:00:00Z'};
