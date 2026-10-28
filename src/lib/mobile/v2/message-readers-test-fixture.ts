import { messageSendIdentity,messageSendId } from './message-send-test-fixture';
import type { MobileMessageReadersPage } from './message-readers';
export const messageReadersIdentity={...messageSendIdentity,permissions:[]};
export const messageReadersChannelId=messageSendId(800);
export const messageReadersMessageId=messageSendId(801);
export const messageReadersPage:MobileMessageReadersPage={version:2,identity:messageReadersIdentity,channelId:messageReadersChannelId,messageId:messageReadersMessageId,items:[{profileId:messageSendId(802),fullName:'Actual reader',readAt:'2026-10-24T04:00:00.123456Z'}],after:null,nextCursor:null,fetchedAt:'2026-10-24T04:00:01Z'};
