import { z } from 'zod';
import type { MobileEventReadModel } from './event-read-models';

export const mobileServiceAssignmentStateSchema = z.object({
  actor_id: z.uuid(), team_id: z.uuid(), event_id: z.uuid(), assignment_id: z.uuid(), member_id: z.uuid(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), deleted: z.boolean(), changed_at: z.iso.datetime({ offset: true }),
}).strict();
export type MobileServiceAssignmentState = z.infer<typeof mobileServiceAssignmentStateSchema>;
type Identity = { userId: string; teamId: string; memberId: string };

/** Absent capability means legacy/unknown; an explicitly downloaded empty array means no prior own response. */
export function isServiceResponseStateConsistent(event: MobileEventReadModel, identity: Identity): boolean {
  const plan = event.servicePlanning;
  if (!plan || plan.ownResponseStates === undefined) return true;
  if (event.record.team_id !== identity.teamId || event.record.id !== event.id || event.record.approval_status !== 'approved') return false;
  const states = plan.ownResponseStates;
  const ownAssignments = event.assignments.filter(row => row.event_id === event.id && row.team_member_id === identity.memberId);
  const ownIds = new Set(ownAssignments.map(row => row.id));
  if (new Set(states.map(row => row.assignment_id)).size !== states.length || states.some(row => row.actor_id !== identity.userId
    || row.team_id !== identity.teamId || row.member_id !== identity.memberId
    || (row.event_id !== event.id && (!row.deleted || !ownIds.has(row.assignment_id))))) return false;
  if (plan.responses.some(response => !event.assignments.some(assignment => assignment.id === response.assignment_id
    && assignment.event_id === event.id && assignment.team_member_id === response.team_member_id))) return false;
  const ownResponses = plan.responses.filter(row => row.team_member_id === identity.memberId);
  if (new Set(ownResponses.map(row => row.assignment_id)).size !== ownResponses.length) return false;
  if (ownResponses.some(response => !ownIds.has(response.assignment_id) || !response.sync_revision
    || !states.some(state => state.assignment_id === response.assignment_id && !state.deleted && state.revision === response.sync_revision))) return false;
  return states.every(state => state.deleted ? !ownResponses.some(response => response.assignment_id === state.assignment_id)
    : ownIds.has(state.assignment_id) && ownResponses.some(response => response.assignment_id === state.assignment_id && response.sync_revision === state.revision));
}

export function verifiedServiceResponseVersion(event: MobileEventReadModel, identity: Identity, assignmentId: string) {
  if (!event.servicePlanning || !event.assignments.some(row => row.id === assignmentId && row.event_id === event.id && row.team_member_id === identity.memberId)) {
    throw new Error('This assignment is unavailable in the current membership.');
  }
  if (!isServiceResponseStateConsistent(event, identity)) throw new Error('Assignment response changed during download. Refresh before saving its revision.');
  const states = event.servicePlanning.ownResponseStates;
  if (states === undefined) return undefined;
  const state = states.find(row => row.assignment_id === assignmentId);
  return { assignmentId, memberId: identity.memberId, revision: state?.revision ?? 0, deleted: state?.deleted ?? true };
}
