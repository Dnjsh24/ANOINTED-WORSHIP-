import { defaultPreparationTasks } from '../../domain/team-workflows';
import { setlistIdentity as identity, setlistSnapshot, id } from './setlist-state-test-fixture';
import { mobileRehearsalCacheSchema } from './rehearsal-state';
import { createRehearsalCommand, type MobileRehearsalCommand, type MobileRehearsalResult } from './rehearsal-commands';
export { identity, id };
export const rehearsalTimestamp = '2026-10-21T00:00:00Z';
export function rehearsalCache() {
  const snapshot = setlistSnapshot();
  return mobileRehearsalCacheSchema.parse({ version: 2, identity, workspace: {
    setlistId: snapshot.record.id, teamId: identity.teamId, eventId: snapshot.record.event_id,
    eventRevision: snapshot.linkedEvent?.sync_revision ?? null, setlistRevision: snapshot.record.sync_revision,
    slots: snapshot.slots.map(slot => ({ id: slot.id, songId: slot.song_id, revision: slot.sync_revision })),
    plan: { setlist_id: snapshot.record.id, team_id: identity.teamId, revision: 1,
      allocations: [{ slot_id: id(40), minutes: 5, focus: 'Intro' }], tasks: defaultPreparationTasks().map((task, index) => ({ ...task, assignee_member_id: index === 0 ? identity.memberId : null })),
      updated_by: identity.userId, updated_at: rehearsalTimestamp },
    checks: [], readiness: [], members: [{ id: identity.memberId, name: 'Alex' }], assignedMemberIds: [identity.memberId],
  } });
}
export function rehearsalPlanCommand() {
  const command = createRehearsalCommand(rehearsalCache(), { type: 'rehearsal.plan.save',
    allocations: [{ slot_id: id(40), minutes: 10, focus: 'Intro and ending' }], tasks: rehearsalCache().workspace.plan!.tasks }, id(80));
  if (command.type !== 'rehearsal.plan.save') throw new Error('Expected a plan fixture.');
  return command;
}
export function rehearsalTaskCommand() {
  const command = createRehearsalCommand(rehearsalCache(), { type: 'rehearsal.task.respond', taskKey: rehearsalCache().workspace.plan!.tasks[0].key, completed: true }, id(81));
  if (command.type !== 'rehearsal.task.respond') throw new Error('Expected a task fixture.');
  return command;
}
export function rehearsalReadinessCommand() {
  const command = createRehearsalCommand(rehearsalCache(), { type: 'rehearsal.readiness.respond', slotId: id(40), state: 'ready', note: 'Learned intro' }, id(82));
  if (command.type !== 'rehearsal.readiness.respond') throw new Error('Expected a readiness fixture.');
  return command;
}
export function rehearsalRequestCommand() {
  const saved = rehearsalPlanCommand();
  const command = createRehearsalCommand(rehearsalCache(), { type: 'rehearsal.plan.request', ...saved.value, reason: 'Practice the intro together' }, id(83));
  if (command.type !== 'rehearsal.plan.request') throw new Error('Expected a proposal fixture.');
  return command;
}
export function rehearsalApplied(command: MobileRehearsalCommand = rehearsalPlanCommand()): MobileRehearsalResult {
  const workspace = rehearsalCache().workspace;
  if (command.type === 'rehearsal.plan.save') workspace.plan = { ...workspace.plan!, ...command.value, revision: (command.baseValue?.revision ?? 0) + 1 };
  if (command.type === 'rehearsal.task.respond') workspace.checks = [{ setlist_id: command.setlistId, task_key: command.taskKey, team_member_id: identity.memberId, completed: command.completed, updated_at: rehearsalTimestamp }];
  if (command.type === 'rehearsal.readiness.respond') workspace.readiness = [{ event_id: command.baseParent.eventId!, slot_id: command.slotId, team_member_id: identity.memberId, state: command.state, note: command.note, updated_at: rehearsalTimestamp }];
  return { commandId: command.commandId, setlistId: command.setlistId, type: command.type, payloadHash: 'a'.repeat(64), status: 'applied', workspace,
    ...(command.type === 'rehearsal.plan.request' ? { request: {
      id: id(500), team_id: identity.teamId, target_type: 'rehearsal_plan' as const, target_id: command.setlistId,
      base_revision: command.baseValue?.revision ?? 0, changes: command.value,
      before_snapshot: { allocations: workspace.plan?.allocations ?? [], tasks: workspace.plan?.tasks ?? defaultPreparationTasks() }, after_snapshot: null,
      reason: command.reason, status: 'pending' as const, requested_by: identity.userId, reviewed_by: null, review_reason: null,
      requested_at: rehearsalTimestamp, reviewed_at: null, request_nonce: command.commandId, legacy_song_request_id: null,
    } } : {}),
  };
}
