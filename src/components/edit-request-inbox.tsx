"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loadSharedEditRequestsAction as loadRequestsFromServer, reviewSharedEditRequestAction, withdrawSharedEditRequestAction } from "@/app/edit-request-actions";
import { canReviewSharedEdit, type SharedEditRequestPage, type SharedEditRequestRow } from "@/lib/domain/shared-edit-requests";
import type { Permission } from "@/lib/domain/rbac";
import type { PermissionOverrides } from "@/lib/domain/permission-overrides";
async function loadSharedEditRequestsAction(input: unknown): Promise<SharedEditRequestPage> {
  try { return await loadRequestsFromServer(input); }
  catch { return { ok: false, message: "Requests could not be loaded. Retry when connected." }; }
}

function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(describe).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key.replaceAll("_", " ")}: ${describe(item)}`).join(", ");
  return String(value);
}

function RequestCard({ request, userId, role, permissions, permissionOverrides, names, onChanged }: { request: SharedEditRequestRow; userId: string; role: string; permissions?: Permission[]; permissionOverrides?: PermissionOverrides; names: Record<string, string>; onChanged: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const own = request.requested_by === userId;
  const canReview = !own && request.status === "pending" && canReviewSharedEdit(role, request.target_type, permissions, permissionOverrides);
  function decide(decision: "approved" | "rejected" | "withdrawn") {
    startTransition(async () => {
      try {
      const result = decision === "withdrawn" ? await withdrawSharedEditRequestAction({ requestId: request.id }) : await reviewSharedEditRequestAction({ requestId: request.id, decision, reason });
      setMessage(result.message);
      if (result.ok || result.data?.status === "needs_revision") await onChanged();
      } catch { setMessage("The decision could not be confirmed. Your review note is retained; refresh before retrying."); }
    });
  }
  return <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <h2 className="text-lg font-bold capitalize">{request.target_type.replaceAll("_", " ")} changes · {request.status.replaceAll("_", " ")}</h2>
    <p className="mt-1 text-sm text-zinc-400">{own ? "You" : names[request.requested_by] ?? "Team member"} · {new Date(request.requested_at).toISOString().replace("T", " ").slice(0, 16)} UTC</p>
    <p className="mt-3 whitespace-pre-wrap">{request.reason}</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Field</th><th className="p-2">Before</th><th className="p-2">Proposed</th></tr></thead><tbody>{Object.entries(request.changes).map(([key, value]) => <tr key={key} className="border-t border-white/10"><th className="p-2 capitalize">{key.replaceAll("_", " ")}</th><td className="max-w-sm whitespace-pre-wrap break-words p-2">{describe(request.before_snapshot[key])}</td><td className="max-w-sm whitespace-pre-wrap break-words p-2">{describe(value)}</td></tr>)}</tbody></table></div>
    {request.review_reason && <p className="mt-3 text-sm">Review: {request.review_reason}</p>}
    {request.status === "needs_revision" && <p className="mt-3 text-sm text-amber-200">Published content changed. Your proposal is retained here. Open the current content and submit a revised request.</p>}
    {canReview && <div className="mt-4 space-y-3"><label className="block text-sm">Review note (required when rejecting)<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} disabled={pending} className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 p-2" /></label><div className="flex gap-3"><button disabled={pending} onClick={() => decide("approved")} className="rounded-lg bg-violet-600 px-4 py-2">Approve</button><button disabled={pending || !reason.trim()} onClick={() => decide("rejected")} className="rounded-lg border border-white/20 px-4 py-2">Reject</button></div></div>}
    {own && ["pending", "needs_revision"].includes(request.status) && <button disabled={pending} onClick={() => decide("withdrawn")} className="mt-4 rounded-lg border border-white/20 px-4 py-2">Withdraw request</button>}
    <p role="status" className="mt-2 text-sm">{message}</p>
  </article>;
}

export function EditRequestInbox({ initial, userId, role, permissions, permissionOverrides, names }: { initial: SharedEditRequestPage; userId: string; role: string; permissions?: Permission[]; permissionOverrides?: PermissionOverrides; names: Record<string, string> }) {
  const isOwner = role === "owner";
  const [view, setView] = useState<"mine" | "review">(isOwner ? "review" : "mine");
  const [page, setPage] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  async function reload(selected = view) {
    try {
    const result = await loadSharedEditRequestsAction({ view: selected });
    if (result.ok) { setPage(result); setMessage(""); } else setMessage(result.message);
    } catch { setMessage("Requests could not be loaded. Retry when connected."); }
  }
  function switchView(selected: "mine" | "review") {
    startTransition(async () => { const result = await loadSharedEditRequestsAction({ view: selected }); if (result.ok) { setView(selected); setPage(result); setMessage(""); } else setMessage(result.message); });
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3">{!isOwner && <button aria-pressed={view === "mine"} disabled={pending} onClick={() => switchView("mine")} className="rounded-lg border border-white/20 px-4 py-2">My requests</button>}<button aria-pressed={view === "review"} disabled={pending} onClick={() => switchView("review")} className="rounded-lg border border-white/20 px-4 py-2">Review queue</button><button disabled={pending} onClick={() => startTransition(() => reload())} className="rounded-lg border border-white/20 px-4 py-2">Refresh</button>{!isOwner && <Link href="/requests/new" className="rounded-lg bg-violet-600 px-4 py-2">Request changes</Link>}</div>
    <p role="status">{message || (!page.ok ? page.message : "")}</p>
    {page.ok && page.requests.length === 0 && <p className="text-zinc-400">No requests in this view.</p>}
    {page.ok && page.requests.map(request => <RequestCard key={request.id} request={request} userId={userId} role={role} permissions={permissions} permissionOverrides={permissionOverrides} names={names} onChanged={() => reload()} />)}
    {page.ok && page.nextCursor && <button disabled={pending} className="rounded-lg border border-white/20 px-4 py-2" onClick={() => startTransition(async () => {
      const result = await loadSharedEditRequestsAction({ view, cursor: page.nextCursor });
      if (result.ok) setPage({ ...result, requests: [...page.requests, ...result.requests.filter(row => !page.requests.some(existing => existing.id === row.id))] }); else setMessage(result.message);
    })}>Load older requests</button>}
  </div>;
}
