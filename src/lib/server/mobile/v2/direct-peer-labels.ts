import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileIdentity } from '@/lib/mobile/contracts';
import { mobileMessageChannelSchema,type MobileMessageChannel } from '@/lib/mobile/v2/messages';
import { MobileApiError } from '../context';
const rowSchema=z.object({id:z.uuid(),channel_id:z.uuid(),team_member_id:z.uuid(),person:z.object({id:z.uuid(),team_id:z.uuid(),profile_id:z.uuid(),profiles:z.object({full_name:z.string().max(500).nullable()}).nullable()}).strict()}).strict();
const unavailable=()=>new MobileApiError(503,'direct_peer_unverified','Conversation labels could not be verified. Refresh when connected.');
/** The caller must verify current workspace and joined-channel scope afterwards. */
export async function enrichDirectPeerLabels(context:{client:SupabaseClient<Database>;identity:MobileIdentity;signal?:AbortSignal},channels:MobileMessageChannel[]):Promise<MobileMessageChannel[]>{
 const selected=z.array(mobileMessageChannelSchema).max(50).parse(channels);if(new Set(selected.map(row=>row.id)).size!==selected.length||selected.some(row=>row.teamId!==context.identity.teamId))throw unavailable();const direct=selected.filter(row=>row.type==='direct');if(!direct.length)return selected;
 const ids=direct.map(row=>row.id);context.signal?.throwIfAborted();
 // Exact count prevents a server row cap or a large legacy room from making a
 // truncated two-row prefix look like an actual two-person conversation.
 // Keep a left relation and count every channel-member row. Filtering the
 // person join could hide a corrupt/foreign third participant from the proof.
 const query=context.client.from('message_channel_members').select('id,channel_id,team_member_id,person:team_members(id,team_id,profile_id,profiles(full_name))',{count:'exact'}).in('channel_id',ids).order('channel_id',{ascending:true}).order('id',{ascending:true}).limit(101);
 const result=await(context.signal?query.abortSignal(context.signal):query);context.signal?.throwIfAborted();if(result.error)throw unavailable();const parsed=z.array(rowSchema).max(101).safeParse(result.data);if(!parsed.success||result.count===null||!Number.isSafeInteger(result.count)||result.count<parsed.data.length)throw unavailable();const rows=parsed.data;
 const joinIds=new Set<string>();const pairs=new Set<string>();const profiles=new Set<string>();for(const row of rows){const pair=`${row.channel_id}:${row.team_member_id}`;const profile=`${row.channel_id}:${row.person.profile_id}`;if(!ids.includes(row.channel_id)||row.person.team_id!==context.identity.teamId||row.person.id!==row.team_member_id||joinIds.has(row.id)||pairs.has(pair)||profiles.has(profile)||row.team_member_id===context.identity.memberId&&row.person.profile_id!==context.identity.userId)throw unavailable();joinIds.add(row.id);pairs.add(pair);profiles.add(profile);}
 if(result.count!==rows.length)return selected;
 const labels=new Map<string,string>();for(const current of direct){const members=rows.filter(row=>row.channel_id===current.id);if(!members.some(row=>row.team_member_id===context.identity.memberId))throw new MobileApiError(403,'direct_peer_access','This conversation is no longer joined.');if(members.length!==2)continue;const peer=members.find(row=>row.team_member_id!==context.identity.memberId);if(!peer||peer.person.profile_id===context.identity.userId)throw unavailable();const name=peer.person.profiles?.full_name;if(name?.trim())labels.set(current.id,name);}
 return selected.map(row=>labels.has(row.id)?{...row,name:labels.get(row.id)!}:row);
}
