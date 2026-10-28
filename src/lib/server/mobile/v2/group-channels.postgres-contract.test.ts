// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { z } from 'zod';
import { mobileGroupChannelRequestSchema,mobileGroupChannelReceiptSchema,assertMobileGroupChannelReceipt } from '@/lib/mobile/v2/group-channels';
import { groupChannelIdentity } from '@/lib/mobile/v2/group-channels-test-fixture';
const path=process.env.MOBILE_GROUP_CHANNEL_PG_CASES;
it.skipIf(!path)('validates fifteen actual atomic group command receipts and all terminal outcomes',()=>{if(!path)throw new Error('Actual isolated PostgreSQL evidence required.');const rows=z.array(z.object({request:mobileGroupChannelRequestSchema,receipt:mobileGroupChannelReceiptSchema}).strict()).parse(JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')));expect(rows).toHaveLength(15);expect(rows.filter(row=>row.receipt.status==='applied')).toHaveLength(9);expect(rows.filter(row=>row.receipt.status==='conflict')).toHaveLength(5);expect(rows.filter(row=>row.receipt.status==='missing')).toHaveLength(1);expect(new Set(rows.map(row=>row.request.operation)).size).toBe(4);for(const {request,receipt} of rows)expect(assertMobileGroupChannelReceipt({...groupChannelIdentity,userId:request.userId,teamId:request.teamId,memberId:request.memberId,role:request.operation==='leave'?'member':'owner'},request,receipt)).toEqual(receipt);});
