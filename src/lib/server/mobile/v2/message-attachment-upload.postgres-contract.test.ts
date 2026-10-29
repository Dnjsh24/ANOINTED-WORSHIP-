// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { z } from 'zod';
import { mobileMessageAttachmentUploadRequestSchema,mobileMessageAttachmentUploadReceiptSchema,assertMobileMessageAttachmentUploadReceipt } from '@/lib/mobile/v2/message-attachment-upload';
import { messageAttachmentUploadIdentity } from '@/lib/mobile/v2/message-attachment-upload-test-fixture';
const path=process.env.MOBILE_MESSAGE_ATTACHMENT_UPLOAD_PG_CASES;
it.skipIf(!path)('validates five actual atomic metadata/message confirmations, including concurrent retry',()=>{if(!path)throw new Error('Actual isolated PostgreSQL evidence required.');const rows=z.array(z.object({request:mobileMessageAttachmentUploadRequestSchema,receipt:mobileMessageAttachmentUploadReceiptSchema}).strict()).parse(JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')));expect(rows).toHaveLength(5);for(const{request,receipt}of rows)expect(assertMobileMessageAttachmentUploadReceipt({...messageAttachmentUploadIdentity,userId:request.userId,teamId:request.teamId,memberId:request.memberId},request,receipt)).toEqual(receipt);expect(new Set(rows.map(row=>row.receipt.message.id)).size).toBe(3);});
