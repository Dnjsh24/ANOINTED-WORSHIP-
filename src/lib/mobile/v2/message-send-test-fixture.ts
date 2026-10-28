import type { MobileMessageSendRequest } from './message-send';
import { profileAvatarIdentity } from './profile-avatar-test-fixture';
export const messageSendIdentity={...profileAvatarIdentity,permissions:['messages.send' as const]};
export const messageSendId=(n:number)=>`99950000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const messageSendRequest:MobileMessageSendRequest={version:2,userId:messageSendIdentity.userId,teamId:messageSendIdentity.teamId,memberId:messageSendIdentity.memberId,requestNonce:messageSendId(1),channelId:messageSendId(2),memberCreatedAt:'2026-10-23T04:00:00.123456Z',body:'  Original text\n'};
export const messageSendResponse={version:2 as const,request:messageSendRequest,status:'confirmed' as const,message:{id:messageSendId(3),createdAt:'2026-10-23T05:00:00.123456Z'}};
