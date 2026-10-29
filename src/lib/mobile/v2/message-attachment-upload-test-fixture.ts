import { messageSendIdentity,messageSendRequest,messageSendId } from './message-send-test-fixture';
import type { MobileMessageAttachmentUploadRequest } from './message-attachment-upload';
export const messageAttachmentUploadIdentity={...messageSendIdentity,permissions:['messages.send' as const,'files.upload' as const]};
export const messageAttachmentUploadRequest:MobileMessageAttachmentUploadRequest={...messageSendRequest,file:{id:messageSendId(500),fileName:'Notes.pdf',mimeType:'application/pdf',sizeBytes:9,sha256:'3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63'}};
export const messageAttachmentUploadReceipt={version:2 as const,request:messageAttachmentUploadRequest,status:'confirmed' as const,fileId:messageAttachmentUploadRequest.file.id,message:{id:messageSendId(501),createdAt:'2026-10-24T03:00:00Z'},recordedAt:'2026-10-24T03:00:00Z'};

