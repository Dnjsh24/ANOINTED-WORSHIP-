// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { z } from 'zod';
import { mobileDirectConversationRequestSchema,mobileDirectConversationReceiptSchema,assertMobileDirectConversationReceipt } from '@/lib/mobile/v2/direct-conversation';
import { directConversationIdentity } from '@/lib/mobile/v2/direct-conversation-test-fixture';
const path=process.env.MOBILE_DIRECT_CONVERSATION_PG_CASES;
it.skipIf(!path)('validates six actual atomic direct-opening receipts including reversed initiators',()=>{if(!path)throw new Error('Actual isolated PostgreSQL evidence required.');const rows=z.array(z.object({request:mobileDirectConversationRequestSchema,receipt:mobileDirectConversationReceiptSchema}).strict()).parse(JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')));expect(rows).toHaveLength(6);expect(rows.filter(row=>row.receipt.created)).toHaveLength(3);for(const {request,receipt} of rows)expect(assertMobileDirectConversationReceipt({...directConversationIdentity,userId:request.userId,teamId:request.teamId,memberId:request.memberId},request,receipt)).toEqual(receipt);expect(new Set(rows.map(row=>row.receipt.channelId)).size).toBe(2);});
