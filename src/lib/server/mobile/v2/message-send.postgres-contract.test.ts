// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { z } from 'zod';
import { mobileMessageSendRequestSchema,mobileMessageSendResponseSchema,assertMobileMessageSendResponse } from '@/lib/mobile/v2/message-send';
import { messageSendIdentity } from '@/lib/mobile/v2/message-send-test-fixture';
const path=process.env.MOBILE_MESSAGE_SEND_PG_CASES;
it.skipIf(!path)('validates four actual PostgreSQL nonce confirmations including concurrent sends',()=>{if(!path)throw new Error('Actual PostgreSQL evidence required.');const rows=z.array(z.object({request:mobileMessageSendRequestSchema,response:mobileMessageSendResponseSchema}).strict()).parse(JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')));expect(rows).toHaveLength(4);for(const {request,response} of rows){const identity={...messageSendIdentity,userId:request.userId,teamId:request.teamId,memberId:request.memberId};expect(assertMobileMessageSendResponse(identity,request,response)).toEqual(response);}expect(new Set(rows.map(row=>row.response.message.id)).size).toBe(2);});
