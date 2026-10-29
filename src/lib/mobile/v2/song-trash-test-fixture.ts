import { messageSendIdentity,messageSendId } from './message-send-test-fixture';
import type { MobileSongRestoreRequest,MobileSongTrashPage } from './song-trash';
export const songTrashIdentity={...messageSendIdentity,role:'owner' as const,permissions:['songs.delete' as const]};
export const songRestoreRequest:MobileSongRestoreRequest={version:2,userId:songTrashIdentity.userId,teamId:songTrashIdentity.teamId,memberId:songTrashIdentity.memberId,memberCreatedAt:'2026-10-24T03:00:00.123456Z',requestNonce:messageSendId(900),base:{id:messageSendId(901),teamId:songTrashIdentity.teamId,createdAt:'2026-10-24T01:00:00.123456Z',revision:4,deletedAt:'2026-10-24T02:00:00.654321Z'}};
export const songRestoreReceipt={version:2 as const,request:songRestoreRequest,status:'applied' as const,current:{...songRestoreRequest.base,revision:5,deletedAt:null},recordedAt:'2026-10-24T04:00:00Z'};
export const songTrashPage:MobileSongTrashPage={version:2,identity:songTrashIdentity,memberCreatedAt:songRestoreRequest.memberCreatedAt,items:[{snapshot:songRestoreRequest.base,title:'Actual song',artist:'Actual artist',originalKey:'C'}],after:null,nextCursor:null,fetchedAt:'2026-10-24T04:00:00Z'};
