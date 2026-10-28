// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { z } from 'zod';
import { mobileMessageReadRequestSchema,mobileMessageReadResponseSchema,assertMobileMessageReadResponse } from '@/lib/mobile/v2/message-read-state';
import { messageSendIdentity } from '@/lib/mobile/v2/message-send-test-fixture';
const path=process.env.MOBILE_MESSAGE_READ_PG_CASES;
it.skipIf(!path)('validates the actual own first-read proof from PostgreSQL RLS',()=>{if(!path)throw new Error('Actual local PostgreSQL evidence required.');const {request,response}=z.object({request:mobileMessageReadRequestSchema,response:mobileMessageReadResponseSchema}).strict().parse(JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')));expect(assertMobileMessageReadResponse({...messageSendIdentity,userId:request.userId,teamId:request.teamId,memberId:request.memberId},request,response)).toEqual(response);expect(response.items).toHaveLength(1);});
