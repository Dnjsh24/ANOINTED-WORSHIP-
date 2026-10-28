import { messageSendIdentity,messageSendRequest,messageSendId } from './message-send-test-fixture';
import type { MobileMessageReplyRequest } from './message-reply';
export const messageReplyIdentity=messageSendIdentity;
export const messageReplyRequest:MobileMessageReplyRequest={...messageSendRequest,parentMessageId:messageSendId(700)};
export const messageReplyResponse={version:2 as const,request:messageReplyRequest,status:'confirmed' as const,message:{id:messageSendId(701),createdAt:'2026-10-24T04:00:00.123456Z'}};
