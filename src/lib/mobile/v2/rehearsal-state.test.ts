import { expect, it } from 'vitest';
import { mobileRehearsalWorkspaceSchema } from './rehearsal-state';
import { rehearsalCache } from './rehearsal-test-fixture';

it.each([false, true])('accepts existing revision-zero rehearsal parents (standalone: %s)', standalone => {
  const workspace = rehearsalCache().workspace;
  const original = {
    ...workspace,
    setlistRevision: 0,
    eventId: standalone ? null : workspace.eventId,
    eventRevision: standalone ? null : 0,
    slots: workspace.slots.map(slot => ({ ...slot, revision: 0 })),
  };
  expect(mobileRehearsalWorkspaceSchema.parse(original)).toEqual(original);
});

it('keeps invalid revision values and uncreated persisted plans rejected', () => {
  const workspace = rehearsalCache().workspace;
  for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(mobileRehearsalWorkspaceSchema.safeParse({ ...workspace, setlistRevision: revision }).success).toBe(false);
    expect(mobileRehearsalWorkspaceSchema.safeParse({ ...workspace, eventRevision: revision }).success).toBe(false);
    expect(mobileRehearsalWorkspaceSchema.safeParse({ ...workspace, slots: workspace.slots.map(slot => ({ ...slot, revision })) }).success).toBe(false);
  }
  expect(mobileRehearsalWorkspaceSchema.safeParse({ ...workspace, plan: { ...workspace.plan!, revision: 0 } }).success).toBe(false);
});
