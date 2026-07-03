"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Clipboard, Copy, CreditCard, FileText, Globe, Info, Key, LayoutGrid, Link2, Lock, Shield, ShieldAlert, Sliders, Users, Users2, Trash2 } from "lucide-react";
import Link from "next/link";
import { SettingsForm } from "@/components/settings-form";
import { Card, Panel } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { deleteTeamAction, leaveTeamAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { initialActionState } from "@/lib/action-state";

const TABS = [
  { id: "controls", label: "Team Controls", icon: LayoutGrid },
  { id: "defaults", label: "Ministry Defaults", icon: Sliders },
  { id: "materials", label: "Private Materials", icon: Lock },
  { id: "workflow", label: "Review Workflow", icon: ShieldAlert },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "activity", label: "Activity Log", icon: FileText },
];

function DeleteTeamSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cn(
        "rounded-xl px-6 py-2.5 text-xs font-bold text-white transition-all duration-200",
        disabled || pending
          ? "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50"
          : "bg-red-600 hover:bg-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.35)] cursor-pointer"
      )}
    >
      {pending ? "Deleting..." : "Delete Team Permanently"}
    </button>
  );
}

function LeaveTeamSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cn(
        "rounded-xl px-6 py-2.5 text-xs font-bold text-white transition-all duration-200",
        disabled || pending
          ? "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50"
          : "bg-amber-600 hover:bg-amber-500 hover:shadow-[0_0_15px_rgba(245,158,11,0.35)] cursor-pointer"
      )}
    >
      {pending ? "Leaving..." : "Leave Team"}
    </button>
  );
}

export function SettingsClientView({
  teamName,
  teamCode,
  isAdmin,
  role,
  defaultServiceLocation,
  defaultCallTime,
  defaultRehearsalTime,
}: {
  teamName: string;
  teamCode: string;
  isAdmin: boolean;
  role?: string;
  defaultServiceLocation: string;
  defaultCallTime: string;
  defaultRehearsalTime: string;
}) {
  const [activeTab, setActiveTab] = useState("controls");
  const [copied, setCopied] = useState(false);
  const [deleteState, deleteFormAction] = useActionState(deleteTeamAction, initialActionState);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [leaveState, leaveFormAction] = useActionState(leaveTeamAction, initialActionState);
  const [leaveConfirmText, setLeaveConfirmText] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");

  function handleCopy() {
    navigator.clipboard.writeText(teamCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function showSettingsStatus(message: string) {
    setSettingsStatus(message);
    window.setTimeout(() => setSettingsStatus(""), 4000);
  }

  return (
    <div className="mt-7 grid gap-6 lg:grid-cols-[240px_1fr] animate-fade-up">
      {/* Sidebar Tabs */}
      <aside className="flex flex-col gap-1">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSettingsStatus("");
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all text-left w-full",
                isActive
                  ? "bg-violet-500/10 text-violet-300 border-l-2 border-violet-500"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              <TabIcon className="size-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </aside>

      {/* Main Settings Content Area */}
      <div className="space-y-6">
        {settingsStatus ? (
          <p
            aria-live="polite"
            className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-xs font-bold text-violet-100"
          >
            {settingsStatus}
          </p>
        ) : null}
        
        {activeTab === "controls" && (
          <div className="space-y-6 animate-fade-in">
            {/* 3-card top grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Team Code */}
              <Panel className="bg-[#111014]/80 flex flex-col justify-between min-h-[180px]">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Team Code</h3>
                  <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 py-3 text-center">
                    <p className="font-mono text-xl font-extrabold tracking-widest text-violet-300">{teamCode}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleCopy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <Copy className="size-3.5" />
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                  <p className="mt-2 text-[10px] font-semibold text-zinc-600 text-center">This code expires in 7 days.</p>
                </div>
              </Panel>

              {/* Invite Members */}
              <Panel className="bg-[#111014]/80 flex flex-col justify-between min-h-[180px]">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Invite Members</h3>
                  <p className="mt-3 text-xs font-semibold text-zinc-400 leading-relaxed">
                    Send an invitation link or share your team code with musicians and leaders.
                  </p>
                </div>
                <Link
                  href="/members/invite"
                  className="mt-6 flex w-full items-center justify-center rounded-xl bg-violet-600 py-2.5 text-xs font-bold text-white transition hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                >
                  Invite Members →
                </Link>
              </Panel>

              {/* Team Information */}
              <Panel className="bg-[#111014]/80 flex flex-col justify-between min-h-[180px]">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Team Information</h3>
                  <div className="mt-3 space-y-1.5 text-xs font-semibold text-zinc-300">
                    <div className="flex justify-between"><span className="text-zinc-500">Name</span><span className="text-white font-bold">{teamName}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Location</span><span>{defaultServiceLocation}</span></div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Service Time</span>
                      <span>
                        {(() => {
                          if (!defaultCallTime) return "Sundays at 9:00 AM";
                          const timeClean = defaultCallTime.trim();
                          if (timeClean.includes("AM") || timeClean.includes("PM")) {
                            return `Sundays at ${timeClean}`;
                          }
                          const parts = timeClean.split(":");
                          if (parts.length >= 2) {
                            const hrs = parseInt(parts[0], 10);
                            const m = parts[1];
                            const ampm = hrs >= 12 ? "PM" : "AM";
                            const displayHrs = hrs % 12 || 12;
                            return `Sundays at ${displayHrs}:${m} ${ampm}`;
                          }
                          return `Sundays at ${timeClean}`;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setActiveTab("defaults")} className="mt-4 block w-full text-center text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">
                  Edit Info →
                </button>
              </Panel>
            </div>

            {/* 2-card middle grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Private Materials */}
              <Panel className="bg-[#111014]/80 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Private Materials</h3>
                  <p className="mt-3 text-xs font-semibold text-zinc-400 leading-relaxed">
                    Only approved team members can access these files, stage plots, chords, and internal notes.
                  </p>
                </div>
                <button type="button" onClick={() => setActiveTab("materials")} className="mt-5 block text-left text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">
                  Manage Access →
                </button>
              </Panel>

              {/* Review Workflow */}
              <Panel className="bg-[#111014]/80 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Review Workflow</h3>
                  <p className="mt-3 text-xs font-semibold text-zinc-400 leading-relaxed">
                    Require approval for new members, song sheets, and content changes before they go live.
                  </p>
                </div>
                <button type="button" onClick={() => setActiveTab("workflow")} className="mt-5 block text-left text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">
                  Manage Workflow →
                </button>
              </Panel>
            </div>

            {/* Bottom full-width card: Permissions Summary */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-bold text-white">Permissions Summary</h3>
                <span className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-400">
                  4 Roles · 29 Members
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  "Edit Setlists",
                  "Manage Songs",
                  "Manage Files",
                  "Invite Members",
                  "View Reports",
                ].map((perm) => (
                  <div key={perm} className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                    <Check className="size-4 text-emerald-400 shrink-0" />
                    <span>{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger Zone: Delete or Leave Team */}
            {role === "owner" ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-950/15 p-5 mt-6">
                <div className="flex items-center gap-3 border-b border-red-500/10 pb-3 text-left">
                  <Trash2 className="size-5 text-red-400 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-red-400">Danger Zone</h3>
                    <p className="text-[11px] text-zinc-500 font-semibold">Irreversible administrative actions</p>
                  </div>
                </div>
                <div className="mt-4 space-y-4 text-left">
                  <p className="text-xs font-semibold text-zinc-400 leading-relaxed">
                    Permanently delete this team, all member records, song configurations, setlists, and communication logs. This action cannot be undone.
                  </p>
                  <form action={deleteFormAction} className="space-y-3">
                    <ActionMessage state={deleteState} />
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold text-zinc-300">
                        To confirm, type <span className="font-mono text-red-300 bg-red-950/30 px-1.5 py-0.5 rounded">DELETE TEAM</span> below:
                      </span>
                      <input
                        type="text"
                        name="confirmText"
                        placeholder="Type DELETE TEAM to confirm"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white outline-none transition focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 placeholder:text-zinc-600"
                      />
                    </label>
                    <div className="flex justify-end pt-2">
                      <DeleteTeamSubmitButton disabled={deleteConfirmText !== "DELETE TEAM"} />
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-950/15 p-5 mt-6">
                <div className="flex items-center gap-3 border-b border-amber-500/10 pb-3 text-left">
                  <Trash2 className="size-5 text-amber-400 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-400">Danger Zone</h3>
                    <p className="text-[11px] text-zinc-500 font-semibold">Leave team associations</p>
                  </div>
                </div>
                <div className="mt-4 space-y-4 text-left">
                  <p className="text-xs font-semibold text-zinc-400 leading-relaxed">
                    Leave this team permanently. You will no longer have access to setlists, songs, or team chat channels. To return, you will need to request join access again.
                  </p>
                  <form action={leaveFormAction} className="space-y-3">
                    <ActionMessage state={leaveState} />
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold text-zinc-300">
                        To confirm, type <span className="font-mono text-amber-300 bg-amber-950/30 px-1.5 py-0.5 rounded">LEAVE TEAM</span> below:
                      </span>
                      <input
                        type="text"
                        name="confirmText"
                        placeholder="Type LEAVE TEAM to confirm"
                        value={leaveConfirmText}
                        onChange={(e) => setLeaveConfirmText(e.target.value)}
                        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white outline-none transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 placeholder:text-zinc-600"
                      />
                    </label>
                    <div className="flex justify-end pt-2">
                      <LeaveTeamSubmitButton disabled={leaveConfirmText !== "LEAVE TEAM"} />
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "defaults" && (
          <div className="animate-fade-in bg-[#111014]/80 rounded-2xl border border-white/[0.08] p-5">
            <SettingsForm
              teamName={teamName}
              teamCode={teamCode}
              isAdmin={isAdmin}
              defaultServiceLocation={defaultServiceLocation}
              defaultCallTime={defaultCallTime}
              defaultRehearsalTime={defaultRehearsalTime}
            />
          </div>
        )}

        {activeTab === "materials" && (
          <div className="space-y-6 animate-fade-in text-left">
            <Panel className="bg-[#111014]/80 p-5">
              <h3 className="text-base font-bold text-white mb-2">Private Materials Settings</h3>
              <p className="text-xs text-zinc-400 font-semibold mb-6">
                Protect and restrict downloads of chord sheets, practice media files, and internal documents.
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div>
                    <h4 className="text-sm font-bold text-white">Enable PDF Watermarking</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Automatically stamps member names on downloaded chord sheets.</p>
                  </div>
                  <input type="checkbox" defaultChecked className="size-4.5 accent-violet-500 rounded cursor-pointer" />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div>
                    <h4 className="text-sm font-bold text-white">Strict Audition File Access</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Restricts access to vocal/instrument practice guide tracks to assigned members only.</p>
                  </div>
                  <input type="checkbox" defaultChecked className="size-4.5 accent-violet-500 rounded cursor-pointer" />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div>
                    <h4 className="text-sm font-bold text-white">Auto-expire Audio Files</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Deletes practice guide audio files from storage 24 hours after the service ends.</p>
                  </div>
                  <input type="checkbox" className="size-4.5 accent-violet-500 rounded cursor-pointer" />
                </div>

                <div className="grid gap-4 md:grid-cols-2 pt-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Stage Plot Access Level</span>
                    <select className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-xs font-semibold text-white outline-none focus:border-violet-400">
                      <option value="all">All Team Members</option>
                      <option value="leaders">Leaders & Admins Only</option>
                      <option value="admins">Admins & Owners Only</option>
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Lyric/Chord PDF Downloads</span>
                    <select className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-xs font-semibold text-white outline-none focus:border-violet-400">
                      <option value="allow">Allow Downloads (All Members)</option>
                      <option value="leaders">Allow Downloads (Leaders Only)</option>
                      <option value="disable">Disable Downloads (View Only)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => showSettingsStatus("Private material preferences are ready on this screen. Team-wide persistence needs a dedicated database setting before deployment.")}
                  className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </Panel>
          </div>
        )}

        {activeTab === "workflow" && (
          <div className="space-y-6 animate-fade-in text-left">
            <Panel className="bg-[#111014]/80 p-5">
              <h3 className="text-base font-bold text-white mb-2">Review & Approval Workflows</h3>
              <p className="text-xs text-zinc-400 font-semibold mb-6">
                Establish review criteria before updates, song edits, or memberships go public.
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div>
                    <h4 className="text-sm font-bold text-white">Require Join Approvals</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Admins must approve requests before new users can access the team calendar.</p>
                  </div>
                  <input type="checkbox" defaultChecked className="size-4.5 accent-violet-500 rounded cursor-pointer" />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div>
                    <h4 className="text-sm font-bold text-white">Review Chord Sheet Changes</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Require reviews by the Worship Pastor before song chord changes go live.</p>
                  </div>
                  <input type="checkbox" defaultChecked className="size-4.5 accent-violet-500 rounded cursor-pointer" />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div>
                    <h4 className="text-sm font-bold text-white">Review Setlist Edits</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Owners must sign off on scheduled service orders and team arrangements.</p>
                  </div>
                  <input type="checkbox" className="size-4.5 accent-violet-500 rounded cursor-pointer" />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div>
                    <h4 className="text-sm font-bold text-white">Auto-Notify Team on Approval</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Send push alerts and chat updates immediately after a song/setlist is approved.</p>
                  </div>
                  <input type="checkbox" defaultChecked className="size-4.5 accent-violet-500 rounded cursor-pointer" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => showSettingsStatus("Workflow preferences are ready on this screen. Apply the pending Supabase migrations before making them team-wide.")}
                  className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </Panel>
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="space-y-6 animate-fade-in text-left">
            <Panel className="bg-[#111014]/80 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-white">Role-Based Access Control</h3>
                <span className="rounded bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-300">Custom Mode</span>
              </div>
              <p className="text-xs text-zinc-400 font-semibold mb-6">
                Map administrative privileges to specific roles in your ministry.
              </p>

              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.03] text-zinc-400 font-bold uppercase tracking-wider">
                      <th className="p-3">Permissions</th>
                      <th className="p-3 text-center">Owner</th>
                      <th className="p-3 text-center">Admin</th>
                      <th className="p-3 text-center">Leader</th>
                      <th className="p-3 text-center">Member</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-zinc-300 font-medium">
                    {[
                      { key: "setlists", label: "Create / Edit Setlists" },
                      { key: "songs", label: "Add / Edit Songs & Chords" },
                      { key: "files", label: "Manage Attachments & PDFs" },
                      { key: "members", label: "Invite & Manage Members" },
                      { key: "integrations", label: "Configure API Integrations" },
                      { key: "billing", label: "Manage Plan & Billing" },
                    ].map((row) => (
                      <tr key={row.key} className="hover:bg-white/[0.01] transition-colors">
                        <td className="p-3 font-bold text-white">{row.label}</td>
                        <td className="p-3 text-center">
                          <input type="checkbox" defaultChecked disabled className="accent-violet-500 size-4 rounded" />
                        </td>
                        <td className="p-3 text-center">
                          <input type="checkbox" defaultChecked className="accent-violet-500 size-4 rounded" />
                        </td>
                        <td className="p-3 text-center">
                          <input type="checkbox" defaultChecked={["setlists", "songs", "files"].includes(row.key)} className="accent-violet-500 size-4 rounded" />
                        </td>
                        <td className="p-3 text-center">
                          <input type="checkbox" defaultChecked={false} className="accent-violet-500 size-4 rounded" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => showSettingsStatus("Permission changes are staged on this screen. Database-backed custom permissions need a future RBAC migration.")}
                  className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 transition-colors"
                >
                  Save Permissions
                </button>
              </div>
            </Panel>
          </div>
        )}

        {activeTab === "integrations" && (
          <div className="space-y-6 animate-fade-in text-left">
            <h3 className="text-base font-bold text-white">Integrations & Connections</h3>
            
            <div className="grid gap-6 md:grid-cols-2">
              {/* Planning Center */}
              <Panel className="bg-[#111014]/80 p-5 flex flex-col justify-between min-h-[160px] border border-white/[0.06] hover:border-violet-500/20 transition-all">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-extrabold text-white">Planning Center Online</h4>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">Connected</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    Sync service items, dates, and member schedules automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => showSettingsStatus("Planning Center disconnect requires provider credentials. No live connection was changed.")}
                  className="mt-5 w-full rounded-xl border border-red-500/20 bg-red-500/5 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 transition"
                >
                  Disconnect Account
                </button>
              </Panel>

              {/* SongSelect */}
              <Panel className="bg-[#111014]/80 p-5 flex flex-col justify-between min-h-[160px] border border-white/[0.06] hover:border-violet-500/20 transition-all">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-extrabold text-white">CCLI SongSelect</h4>
                    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[9px] font-bold text-zinc-400 border border-white/[0.06]">Available</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    Search and import lyrics and official chord charts directly into your song catalog.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => showSettingsStatus("SongSelect setup needs CCLI OAuth credentials before it can connect.")}
                  className="mt-5 w-full rounded-xl bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-500 transition"
                >
                  Connect SongSelect
                </button>
              </Panel>

              {/* Spotify / Apple Music */}
              <Panel className="bg-[#111014]/80 p-5 flex flex-col justify-between min-h-[160px] border border-white/[0.06] hover:border-violet-500/20 transition-all">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-extrabold text-white">Spotify Playlists</h4>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">Connected</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    Auto-generate practice playlists for Sunday team members to listen and prepare.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => showSettingsStatus("Playlist sync settings need a music provider connection before they can be saved.")}
                  className="mt-5 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition"
                >
                  Configure Playlist Sync
                </button>
              </Panel>

              {/* Slack / Discord */}
              <Panel className="bg-[#111014]/80 p-5 flex flex-col justify-between min-h-[160px] border border-white/[0.06] hover:border-violet-500/20 transition-all">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-extrabold text-white">Discord Notification Webhooks</h4>
                    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[9px] font-bold text-zinc-400 border border-white/[0.06]">Available</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    Ping a #worship channel when setlists are published or times change.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => showSettingsStatus("Discord webhooks need a webhook URL saved securely before they can be enabled.")}
                  className="mt-5 w-full rounded-xl bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-500 transition"
                >
                  Enable Webhooks
                </button>
              </Panel>
            </div>
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-6 animate-fade-in text-left">
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* Subscription details */}
              <Panel className="bg-[#111014]/80 p-5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 mb-4">Subscription Plan</h3>
                <h4 className="text-2xl font-extrabold text-white">Worship Pro Plan</h4>
                <p className="text-xs text-zinc-400 mt-1">Private ministry management up to 50 members.</p>
                
                <div className="mt-6 space-y-2 border-t border-white/[0.04] pt-4">
                  <div className="flex justify-between text-xs font-semibold"><span className="text-zinc-500">Plan Rate:</span><span className="text-white">$29.00 / month</span></div>
                  <div className="flex justify-between text-xs font-semibold"><span className="text-zinc-500">Next Renewal:</span><span className="text-violet-300">July 15, 2026</span></div>
                  <div className="flex justify-between text-xs font-semibold"><span className="text-zinc-500">Status:</span><span className="text-emerald-400">Active (Auto-renewing)</span></div>
                </div>

                <button
                  type="button"
                  onClick={() => showSettingsStatus("Plan upgrades need a billing provider integration before checkout can open.")}
                  className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition w-full"
                >
                  Upgrade to Enterprise Plan
                </button>
              </Panel>

              {/* Payment method */}
              <Panel className="bg-[#111014]/80 p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 mb-4">Payment Method</h3>
                  <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-zinc-800 font-bold text-white text-xs">VISA</span>
                    <div>
                      <p className="text-xs font-bold text-white">Visa Ending in 4242</p>
                      <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Expires 12/2028</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => showSettingsStatus("Card updates need a secure billing portal before payment details can be changed.")}
                  className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition w-full"
                >
                  Update Card Details
                </button>
              </Panel>
            </div>

            {/* Invoices */}
            <Panel className="bg-[#111014]/80 p-5">
              <h3 className="text-sm font-bold text-white mb-4">Invoice History</h3>
              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.03] text-zinc-400 font-bold uppercase tracking-wider">
                      <th className="p-3">Invoice ID</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-zinc-300 font-medium">
                    {[
                      { id: "INV-98212", date: "Jun 15, 2026", amount: "$29.00", status: "Paid" },
                      { id: "INV-97422", date: "May 15, 2026", amount: "$29.00", status: "Paid" },
                      { id: "INV-96541", date: "Apr 15, 2026", amount: "$29.00", status: "Paid" },
                    ].map((inv) => (
                      <tr key={inv.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="p-3 font-mono font-bold text-white">{inv.id}</td>
                        <td className="p-3 text-zinc-400">{inv.date}</td>
                        <td className="p-3 font-bold">{inv.amount}</td>
                        <td className="p-3">
                          <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400">{inv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-6 animate-fade-in text-left">
            <Panel className="bg-[#111014]/80 p-5">
              <h3 className="text-base font-bold text-white mb-2">Team Activity Audit Log</h3>
              <p className="text-xs text-zinc-400 font-semibold mb-6">
                A secure history of administrative events, member status changes, and settings modifications.
              </p>

              <div className="space-y-3.5">
                {[
                  { user: "Casey Lee", action: "added song 'Opening Song' to Sunday Service Setlist", time: "10 mins ago", role: "admin" },
                  { user: "Alex Morgan", action: "updated general team location preferences", time: "2 hours ago", role: "owner" },
                  { user: "Worship Bot", action: "auto-expired Rehearsal practice guide audio files", time: "4 hours ago", role: "system" },
                  { user: "Alex Morgan", action: "approved team join request from Jordan Lee (Guitarist)", time: "1 day ago", role: "owner" },
                  { user: "Casey Lee", action: "regenerated team invitation security code", time: "3 days ago", role: "admin" },
                  { user: "Alex Morgan", action: "modified Leader role permissions", time: "5 days ago", role: "owner" },
                ].map((log, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-3 last:border-0 last:pb-0">
                    <div className="flex gap-2.5">
                      <span className={cn(
                        "mt-0.5 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase shrink-0",
                        log.role === "owner" ? "bg-violet-500/10 text-violet-300 border border-violet-500/20" :
                        log.role === "admin" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        log.role === "system" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-zinc-800 text-zinc-400"
                      )}>
                        {log.role}
                      </span>
                      <p className="text-xs font-semibold text-zinc-300">
                        <span className="text-white font-bold mr-1">{log.user}</span>
                        {log.action}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-zinc-500 shrink-0">{log.time}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

      </div>
    </div>
  );
}
