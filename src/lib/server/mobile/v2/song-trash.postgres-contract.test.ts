// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { z } from 'zod';
import { mobileSongRestoreRequestSchema,mobileSongRestoreReceiptSchema,assertMobileSongRestoreReceipt } from '@/lib/mobile/v2/song-trash';
import { songTrashIdentity } from '@/lib/mobile/v2/song-trash-test-fixture';
const path=process.env.MOBILE_SONG_RESTORE_PG_CASES;
it.skipIf(!path)('validates eight actual atomic restore receipts including microsecond CAS and concurrent replay',()=>{if(!path)throw new Error('Actual isolated PostgreSQL evidence required.');const rows=z.array(z.object({request:mobileSongRestoreRequestSchema,receipt:mobileSongRestoreReceiptSchema}).strict()).parse(JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')));expect(rows).toHaveLength(8);expect(rows.filter(row=>row.receipt.status==='applied')).toHaveLength(4);expect(rows.filter(row=>row.receipt.status==='conflict')).toHaveLength(3);expect(rows.filter(row=>row.receipt.status==='missing')).toHaveLength(1);for(const{request,receipt}of rows)expect(assertMobileSongRestoreReceipt({...songTrashIdentity,userId:request.userId,teamId:request.teamId,memberId:request.memberId},request,receipt)).toEqual(receipt);});
