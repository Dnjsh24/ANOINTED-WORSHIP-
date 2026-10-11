import { act, render, screen, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), report: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/wooly-actions", () => ({ readTutorialProgressAction: actions.read, saveTutorialProgressAction: actions.save }));
vi.mock("@/app/actions", () => ({ submitFeedbackAction: actions.report }));

import { QuickReportButton } from "@/components/quick-report-button";
vi.mock("@/app/wooly-chat-actions", () => ({ answerWoolyQuestionAction: vi.fn().mockResolvedValue({ kind: "unknown", text: "Unknown" }) }));
vi.mock("@/app/wooly-support-actions", () => ({ listMyWoolyRequestsAction: vi.fn().mockResolvedValue({ ok: true, data: { requests: [], isSupport: false, unread: 0 } }), readWoolyThreadAction: vi.fn(), submitWoolyRequestAction: vi.fn(), replyWoolyThreadAction: vi.fn(), setWoolyRequestStatusAction: vi.fn() }));

import { WoolyProvider, WoolyScreen } from "./wooly-provider";

const audience = { userId: "member-1", hasTeam: true, canManageMembers: false };

function Website({ enabled = true, report = true }: { enabled?: boolean; report?: boolean }) {
  return <WoolyProvider enabled={enabled}><WoolyScreen audience={audience} />{report && <QuickReportButton />}</WoolyProvider>;
}

async function openReport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Wooly" }));
  await user.click(screen.getByRole("button", { name: /Quick Report/ }));
  return screen.findByRole("dialog", { name: "Quick Report" });
}

describe("Wooly Quick Report handoff", () => {
  beforeEach(() => {
    actions.read.mockReset().mockResolvedValue({ ok: true, progress: [] });
    actions.save.mockReset().mockImplementation(async (checkpoint) => ({ ok: true, progress: { ...checkpoint, updatedAt: new Date().toISOString() } }));
    actions.report.mockReset().mockResolvedValue({ ok: false, message: "Try again when connected." });
  });
  afterEach(() => { document.body.style.overflow = ""; });

  it("moves report access into Wooly, opens just one dialog, and restores Wooly after Escape", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "scroll";
    render(<Website />);
    const launcher = await screen.findByRole("button", { name: "Wooly" });
    expect(within(launcher).getByText("Need help?").closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "Report a bug or suggest improvement" })).not.toBeInTheDocument();
    const dialog = await openReport(user);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "Help with Wooly" })).not.toBeInTheDocument();
    expect(screen.queryByText("Need help?")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close quick report" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    expect(actions.report).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Wooly" })).toHaveFocus());
    expect(document.body.style.overflow).toBe("scroll");
    expect(screen.getByText("Need help?")).toBeInTheDocument();
  });

  it("keeps keyboard focus inside the report and returns to Wooly when cancelled", async () => {
    const user = userEvent.setup();
    render(<Website />);
    const dialog = await openReport(user);
    const close = within(dialog).getByRole("button", { name: "Close quick report" });
    const submit = within(dialog).getByRole("button", { name: "Submit" });
    await user.tab({ shift: true });
    expect(submit).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Wooly" })).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the existing report action and preserves the real form fields and error reply", async () => {
    const user = userEvent.setup();
    render(<Website />);
    const dialog = await openReport(user);
    await user.click(within(dialog).getByRole("radio", { name: "Improvement" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Clearer labels");
    await user.type(within(dialog).getByRole("textbox", { name: "Description (optional)" }), "Make the labels easier to read.");
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));
    expect(await within(dialog).findByText("Try again when connected.")).toBeInTheDocument();
    expect(actions.report).toHaveBeenCalledOnce();
    const payload = actions.report.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(payload)).toMatchObject({ reportType: "improvement", title: "Clearer labels", description: "Make the labels easier to read.", pageUrl: window.location.href });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("keeps the original floating report trigger when Wooly is disabled", async () => {
    const user = userEvent.setup();
    render(<Website enabled={false} />);
    const trigger = screen.getByRole("button", { name: "Report a bug or suggest improvement" });
    expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument();
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Quick Report" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close quick report" }));
    expect(trigger).toHaveFocus();
  });

  it("removes the help option when its report form unmounts", async () => {
    const user = userEvent.setup();
    const view = render(<Website />);
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    expect(screen.getByRole("button", { name: /Quick Report/ })).toBeInTheDocument();
    view.rerender(<Website report={false} />);
    expect(screen.queryByRole("button", { name: /Quick Report/ })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Help with Wooly" })).toBeInTheDocument();
  });

  it("preserves a paused tutorial while the report dialog is open", async () => {
    const user = userEvent.setup();
    render(<Website />);
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Show me this page" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Save your profile" })).toBeInTheDocument();
    await openReport(user);
    expect(screen.queryByRole("region", { name: "Wooly guided tour" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Your profile" }));
    expect(screen.getByRole("heading", { name: "Save your profile" })).toBeInTheDocument();
  });

  it.each([true, false])("hydrates report access consistently with Wooly enabled=%s", async (enabled) => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Website enabled={enabled} />);
    document.body.append(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, <Website enabled={enabled} />, { onRecoverableError }); });
      expect(screen.queryByRole("button", { name: "Report a bug or suggest improvement" }) !== null).toBe(!enabled);
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
