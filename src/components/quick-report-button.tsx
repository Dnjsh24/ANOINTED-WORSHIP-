"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { Bug, Lightbulb, X } from "lucide-react";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/action-state";
import { submitFeedbackAction } from "@/app/actions";

const initialState: ActionState = { ok: false, message: "" };

type ReportType = "bug" | "improvement";

const reportTypeOptions: { value: ReportType; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug Report", icon: Bug },
  { value: "improvement", label: "Improvement", icon: Lightbulb },
];

export function QuickReportButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("bug");
  const [pageUrl, setPageUrl] = useState("");
  const [state, formAction] = useActionState(submitFeedbackAction, initialState);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.ok) {
      const timer = setTimeout(() => {
        setOpen(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.ok]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
        )].filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-label="Report a bug or suggest improvement"
        onClick={() => {
          setPageUrl(window.location.href);
          setOpen(true);
        }}
        className={cn(
          "fixed bottom-24 left-4 z-20 size-12 items-center justify-center rounded-full bg-violet-600 text-white transition-all duration-200 hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300 md:bottom-6 md:left-auto md:right-6 md:z-40",
          pathname === "/messages" ? "hidden md:flex" : "flex",
        )}
      >
        <Bug className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-report-title" tabIndex={-1} className="w-full max-w-md rounded-xl border border-white/10 bg-[#18171c] shadow-2xl shadow-black/40 animate-fade-in outline-none">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 id="quick-report-title" className="text-sm font-bold text-white">Quick Report</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close quick report"
                className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white transition"
              >
                <X className="size-4" />
              </button>
            </div>

            <form action={formAction} className="space-y-4 px-5 py-4">
              <ActionMessage state={state} />

              <input type="hidden" name="pageUrl" value={pageUrl} />

              <fieldset>
                <legend className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Type</legend>
                <div className="flex gap-2">
                  {reportTypeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = reportType === option.value;
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold transition",
                          isActive
                            ? "border-violet-400/40 bg-violet-500/20 text-violet-100"
                            : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white",
                        )}
                      >
                        <input
                          type="radio"
                          name="reportType"
                          value={option.value}
                          checked={isActive}
                          onChange={() => setReportType(option.value)}
                          className="sr-only"
                        />
                        <Icon className="size-3.5" />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Title</span>
                <Input
                  name="title"
                  placeholder={reportType === "bug" ? "What went wrong?" : "What would make it better?"}
                  required
                  className="h-10 text-xs font-bold"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Description (optional)</span>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Add more details..."
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 resize-none"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] transition"
                >
                  Cancel
                </button>
                <SubmitButton className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500">
                  Submit
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
