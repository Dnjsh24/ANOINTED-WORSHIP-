import { z } from 'zod';
import { mobileIdentitySchema,type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
export const mobileMessageAttachmentSchema=z.object({id:z.uuid(),fileName:z.string().max(500),mimeType:z.string().max(255),sizeBytes:z.number().int().positive().max(15728640)}).strict();
export const mobileMessageAttachmentResponseSchema=z.object({version:z.literal(2),identity:mobileIdentitySchema,channelId:z.uuid(),messageId:z.uuid(),attachment:mobileMessageAttachmentSchema.nullable(),fetchedAt:z.iso.datetime({offset:true})}).strict();
export type MobileMessageAttachmentResponse=z.infer<typeof mobileMessageAttachmentResponseSchema>;
export function assertMobileMessageAttachmentResponse(identity:MobileIdentity,channelId:string,messageId:string,value:unknown):MobileMessageAttachmentResponse{const result=mobileMessageAttachmentResponseSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);if(result.channelId!==channelId||result.messageId!==messageId)throw new Error('Attachment metadata belongs to another conversation or message.');return result;}
export const MOBILE_MESSAGE_ATTACHMENT_URL_MAX_BYTES=4096;
export const MOBILE_MESSAGE_ATTACHMENT_MAX_BYTES=15728640;
export const mobileMessageAttachmentDownloadRequestSchema=z.object({version:z.literal(2),attachment:mobileMessageAttachmentSchema}).strict();
export type MobileMessageAttachmentDownloadRequest=z.infer<typeof mobileMessageAttachmentDownloadRequestSchema>;
export const mobileMessageAttachmentDownloadSchema=z.object({version:z.literal(2),identity:mobileIdentitySchema,channelId:z.uuid(),messageId:z.uuid(),attachment:mobileMessageAttachmentSchema,assetVersion:z.string().regex(/^[a-f0-9]{64}$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),url:z.url().max(4096),expiresAt:z.iso.datetime()}).strict();
export type MobileMessageAttachmentDownload=z.infer<typeof mobileMessageAttachmentDownloadSchema>;
export function assertMobileMessageAttachmentDownload(identity:MobileIdentity,channelId:string,messageId:string,request:MobileMessageAttachmentDownloadRequest,value:unknown,configuredOrigin:string):MobileMessageAttachmentDownload{
 const input=mobileMessageAttachmentDownloadRequestSchema.parse(request);const result=mobileMessageAttachmentDownloadSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);
 const url=new URL(result.url);const configured=new URL(configuredOrigin);const path=decodeURIComponent(url.pathname);const prefix=`/storage/v1/object/sign/practice-files/${identity.teamId}/`;const rest=path.slice(prefix.length);
 if(result.channelId!==channelId||result.messageId!==messageId||JSON.stringify(result.attachment)!==JSON.stringify(input.attachment)||url.protocol!=='https:'||url.origin!==configured.origin||url.username||url.password||url.hash||!path.startsWith(prefix)||!rest||rest.split('/').some(part=>!part||part==='.'||part==='..')||/[\\\u0000-\u001f\u007f%]/.test(path)||[...url.searchParams.keys()].some(key=>key!=='token')||url.searchParams.getAll('token').length!==1||!url.searchParams.get('token')||Date.parse(result.expiresAt)<=Date.now()||Date.parse(result.expiresAt)>Date.now()+65000)throw new Error('Attachment download scope or source differs.');
 return result;
}
