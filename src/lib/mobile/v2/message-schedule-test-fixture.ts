import { messageSendIdentity,messageSendRequest,messageSendId } from './message-send-test-fixture';
import type { MobileMessageScheduleRequest } from './message-schedule';
export const messageScheduleIdentity=messageSendIdentity;
export const messageScheduleRequest:MobileMessageScheduleRequest={...messageSendRequest,scheduledFor:'2099-10-24T04:00:00.000Z'};
export const messageScheduleResponse={version:2 as const,request:messageScheduleRequest,status:'confirmed' as const,message:{id:messageSendId(600),createdAt:'2026-10-24T04:00:00Z',scheduledFor:messageScheduleRequest.scheduledFor,isDelivered:false}};
