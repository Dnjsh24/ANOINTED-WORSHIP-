"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { submitSharedEditRequestAction } from "@/app/edit-request-actions";
import { preparationTaskSchema, rehearsalAllocationSchema, serviceOrderEntrySchema } from "@/lib/domain/team-workflows";

const common = { revision: z.number().int().min(0), reason: z.string().trim().min(1).max(1000), requestNonce: z.uuid() };
export async function requestRehearsalPlanAction(setlistId: string, input: unknown): Promise<ActionState> {
  const parsed = z.object({ ...common, allocations: z.array(rehearsalAllocationSchema).max(200), tasks: z.array(preparationTaskSchema).length(10) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the plan and give a reason before requesting changes." };
  return submitSharedEditRequestAction({ targetType: "rehearsal_plan", targetId: setlistId, revision: parsed.data.revision, changes: { allocations: parsed.data.allocations, tasks: parsed.data.tasks }, reason: parsed.data.reason, requestNonce: parsed.data.requestNonce });
}
export async function requestServiceOrderAction(eventId: string, input: unknown): Promise<ActionState> {
  const parsed = z.object({ ...common, entries: z.array(serviceOrderEntrySchema).max(200), required_roles: z.array(z.string().trim().min(1).max(80)).max(30) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the running order and give a reason before requesting changes." };
  return submitSharedEditRequestAction({ targetType: "service_order", targetId: eventId, revision: parsed.data.revision, changes: { entries: parsed.data.entries, required_roles: parsed.data.required_roles }, reason: parsed.data.reason, requestNonce: parsed.data.requestNonce });
}
