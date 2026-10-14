import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/teams", push: vi.fn() }));
const actions = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push: navigation.push }) }));
vi.mock("@/app/wooly-actions", () => ({ readTutorialProgressAction: actions.read, saveTutorialProgressAction: actions.save }));

vi.mock("@/app/wooly-chat-actions", () => ({ answerWoolyQuestionAction: vi.fn().mockResolvedValue({ kind: "unknown", text: "Unknown" }) }));
vi.mock("@/app/wooly-support-actions", () => ({ listMyWoolyRequestsAction: vi.fn().mockResolvedValue({ ok: true, data: { requests: [], isSupport: false, unread: 0 } }), readWoolyThreadAction: vi.fn(), submitWoolyRequestAction: vi.fn(), replyWoolyThreadAction: vi.fn(), setWoolyRequestStatusAction: vi.fn() }));

import { WoolyProvider, WoolyScreen } from "@/components/wooly/wooly-provider";
import type { WoolyAudience } from "@/lib/domain/wooly";
import { woolyKnowledge } from "@/lib/domain/wooly-knowledge";
import { permissionValues } from "@/lib/domain/wooly-permissions";

const newMember: WoolyAudience = { userId: "member-1", hasTeam: false, canManageMembers: false };
const teammate: WoolyAudience = { userId: "member-2", hasTeam: true, canManageMembers: false };

function renderWooly(audience: WoolyAudience, target = "team-choice", onTargetClick = () => undefined) {
  return render(<WoolyProvider><WoolyScreen audience={audience} /><button data-wooly-target={target} onClick={onTargetClick}>Page content</button></WoolyProvider>);
}

describe("WoolyProvider", () => {
  it("ignores the closed mobile drawer and responds when its visibility changes", async () => {
    navigation.pathname = "/dashboard";
    const audience = { ...teammate, session: "demo" as const };
    const content = (open: boolean) => <WoolyProvider><WoolyScreen audience={audience} /><div role="dialog" aria-label="Mobile navigation" aria-hidden={!open} inert={!open}>Navigation</div></WoolyProvider>;
    const view = render(content(false));
    expect(await screen.findByRole("button", { name: "Wooly" })).toBeVisible();
    view.rerender(content(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument());
    view.rerender(content(false));
    expect(await screen.findByRole("button", { name: "Wooly" })).toBeVisible();
  });

  it("ignores dialogs concealed by CSS on an ancestor", async () => {
    navigation.pathname = "/dashboard";
    render(<WoolyProvider><WoolyScreen audience={{ ...teammate, session: "demo" }} /><div style={{ display: "none" }}><div role="dialog">Hidden navigation</div></div></WoolyProvider>);
    expect(await screen.findByRole("button", { name: "Wooly" })).toBeVisible();
  });

  it.each(["Skip", "Close Wooly guide"])("continues a supported task inside its dialog and keeps focus inside after %s", async (closeControl) => {
    const task = woolyKnowledge.find((entry) => entry.surface === "announcement" && entry.steps.length > 3)!;
    navigation.pathname = "/announcements";
    const account = { ...teammate, canManageMembers: true, role: "owner", permissions: permissionValues };
    const submit = vi.fn();
    const content = (dialog: boolean) => <WoolyProvider><WoolyScreen audience={account} />{dialog && <div role="dialog" aria-label="Add Announcement" data-wooly-surface="announcement" data-wooly-target="notice-form"><form onSubmit={submit}><input aria-label="Announcement title" /><button>Post Announcement</button></form></div>}</WoolyProvider>;
    const view = render(content(false));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: task.title }));
    expect(screen.getByRole("region", { name: "Wooly guided tour" })).toBeVisible();
    view.rerender(content(true));
    const instructions = await screen.findByRole("region", { name: "Wooly task instructions" });
    expect(instructions.closest('[role="dialog"]')).toHaveAttribute("aria-label", "Add Announcement");
    expect(screen.queryByRole("region", { name: "Wooly guided tour" })).not.toBeInTheDocument();
    screen.getByLabelText("Announcement title").focus();
    await user.type(screen.getByLabelText("Announcement title"), "Practice update");
    await user.click(screen.getByRole("button", { name: /^(Next|Finish)$/ }));
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: closeControl }));
    expect(screen.getByRole("dialog", { name: "Add Announcement" })).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Announcement title")).toHaveFocus());
  });
  it("continues the exact task journey after a user opens its expected editor", async () => {
    navigation.pathname = "/setlists";
    const account = { ...teammate, role: "owner", permissions: permissionValues };
    const view = renderWooly(account, "setlist-views");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Create a setlist" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    navigation.pathname = "/setlists/new";
    view.rerender(<WoolyProvider><WoolyScreen audience={account} /><button data-wooly-target="setlist-details">New plan</button></WoolyProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Step 2: Create a setlist" })).toBeVisible());
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Step 3: Create a setlist" })).toBeVisible();
  });
  it("opens the real dance form query and keeps its guide on the pathname", async () => {
    navigation.pathname = "/dance";
    const account = { ...teammate, permissions: permissionValues };
    const view = renderWooly(account, "dance-list");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Save a dance chart" }));
    expect(navigation.push).toHaveBeenCalledWith("/dance?new=true");
    try {
      window.history.replaceState(null, "", "/dance?new=true");
      view.rerender(<WoolyProvider><WoolyScreen audience={account} /><button data-wooly-target="dance-save">Save Dance Chart</button></WoolyProvider>);
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("heading", { name: "Step 1: Save a dance chart" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("asks for the user's record instead of choosing an arbitrary one", async () => {
    const task = woolyKnowledge.find((entry) => entry.tutorial && entry.route.includes("["))!;
    const listPath = task.route.split("/[")[0];
    navigation.pathname = listPath;
    renderWooly({ ...teammate, role: "owner", permissions: permissionValues }, "song-list");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: task.title }));
    expect(screen.getByRole("button", { name: "Choose a record" })).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Choose a record" }));
    expect(navigation.push).toHaveBeenCalledWith(listPath);
  });
  beforeEach(() => {
    navigation.pathname = "/teams";
    navigation.push.mockReset();
    actions.read.mockReset().mockResolvedValue({ ok: true, progress: [] });
    actions.save.mockReset().mockImplementation(async (input: { tourId: string; version: number; status: string; nextStep: string }) => ({ ok: true, progress: { ...input, updatedAt: new Date().toISOString() } }));
  });

  it("offers one welcome, saves the offer, and lets the user skip without another automatic offer", async () => {
    const user = userEvent.setup();
    renderWooly(newMember);

    expect(await screen.findByRole("dialog", { name: "Help with Wooly" })).toBeInTheDocument();
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "joining", status: "offered" }));
    await user.click(screen.getByRole("button", { name: "Close Wooly" }));
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(screen.queryByRole("button", { name: "Start tour" })).not.toBeInTheDocument();
  });

  it("dismisses Maybe later without opening help and keeps the launcher available", async () => {
    navigation.pathname = "/dashboard";
    const user = userEvent.setup();
    renderWooly(teammate, "home");
    const pageControl = screen.getByRole("button", { name: "Page content" });
    pageControl.focus();
    await user.click(await screen.findByRole("button", { name: "Maybe later" }));

    expect(screen.queryByRole("dialog", { name: "Help with Wooly" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick Report" })).not.toBeInTheDocument();
    await waitFor(() => expect(pageControl).toHaveFocus());
    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "essentials", status: "offered" }));

    await user.click(screen.getByRole("button", { name: "Wooly" }));
    expect(await screen.findByRole("dialog", { name: "Help with Wooly" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Maybe later" })).not.toBeInTheDocument();
  });

  it("does not offer the before-team tour to a teammate and hides manager topics", async () => {
    navigation.pathname = "/teams";
    renderWooly(teammate, "home");
    expect(await screen.findByRole("button", { name: "Wooly" })).toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Wooly" }));
    expect(screen.queryByRole("button", { name: "How do I manage members?" })).not.toBeInTheDocument();
  });

  it("keeps a tour usable when saving fails and retries the current checkpoint", async () => {
    const user = userEvent.setup();
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "joining", version: 1, status: "offered", nextStep: "welcome", updatedAt: new Date().toISOString() }] });
    actions.save.mockRejectedValue(new Error("offline"));
    renderWooly(newMember);
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Start or replay Join your team" }));
    expect(await screen.findByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hi, I’m Wooly!" })).toBeInTheDocument();
    expect(screen.getByText(/not available right now/i)).toBeInTheDocument();
    expect(screen.getByText(/did not sync/i)).toBeInTheDocument();
    actions.save.mockResolvedValue({ ok: true, progress: { tourId: "joining", version: 1, status: "in_progress", nextStep: "welcome", updatedAt: new Date().toISOString() } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(/could not sync/i)).not.toBeInTheDocument());
  });

  it("navigates only to a permitted help route when the user asks to go there", async () => {
    const user = userEvent.setup();
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "essentials", version: 1, status: "completed", nextStep: "finish", updatedAt: new Date().toISOString() }] });
    navigation.pathname = "/dashboard";
    renderWooly(teammate, "home");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Where are the service songs?" }));
    await user.click(screen.getByRole("button", { name: "Go to where are the service songs?" }));
    expect(navigation.push).toHaveBeenCalledWith("/setlists");
  });

  it("replays a terminal tour without replacing its saved terminal status", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/dashboard";
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "essentials", version: 1, status: "completed", nextStep: "finish", updatedAt: new Date().toISOString() }] });
    renderWooly(teammate, "home");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Start or replay Your Sunday Setlist essentials" }));
    expect(await screen.findByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalledWith(expect.objectContaining({ tourId: "essentials", status: "in_progress" }));
  });

  it("pauses, resumes, and skips a tour with the expected saved checkpoints", async () => {
    const user = userEvent.setup();
    renderWooly(newMember);
    await user.click(await screen.findByRole("button", { name: "Start tour" }));
    await user.click(screen.getByRole("button", { name: "Close Wooly" }));
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Join your team" }));
    expect(await screen.findByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "joining", status: "skipped" })));
  });

  it("ignores a pending progress response after the authenticated identity changes", async () => {
    let resolveFirstRead: ((value: { ok: true; progress: [] }) => void) | undefined;
    actions.read.mockImplementationOnce(() => new Promise((resolve) => { resolveFirstRead = resolve; }))
      .mockResolvedValueOnce({ ok: true, progress: [] });
    const view = renderWooly(newMember);
    await waitFor(() => expect(actions.read).toHaveBeenCalledTimes(1));
    view.rerender(<WoolyProvider><WoolyScreen audience={teammate} /><button data-wooly-target="home">Page content</button></WoolyProvider>);
    await waitFor(() => expect(actions.read).toHaveBeenCalledTimes(2));
    resolveFirstRead?.({ ok: true, progress: [] });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Wooly" }));
    expect(screen.queryByRole("button", { name: "How do I join a team?" })).not.toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalledWith(expect.objectContaining({ tourId: "joining" }));
  });

  it("removes the launcher and panel when its registered screen unmounts", async () => {
    const view = renderWooly(teammate, "home");
    expect(await screen.findByRole("button", { name: "Wooly" })).toBeInTheDocument();
    view.unmount();
    expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument();
  });

  it("preserves the same user checkpoint across screens and pauses on unexpected navigation", async () => {
    const user = userEvent.setup();
    const view = renderWooly(newMember);
    await user.click(await screen.findByRole("button", { name: "Start tour" }));
    expect(await screen.findByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    navigation.pathname = "/setlists";
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...newMember }} /><button data-wooly-target="setlists">Page content</button></WoolyProvider>);
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "joining", status: "paused" })));
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(screen.getByRole("button", { name: "Resume Join your team" })).toBeInTheDocument();
  });

  it("keeps terminal completion available to retry after the tour panel closes", async () => {
    const user = userEvent.setup();
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "joining", version: 1, status: "offered", nextStep: "welcome", updatedAt: new Date().toISOString() }] });
    actions.save.mockRejectedValue(new Error("offline"));
    renderWooly(newMember);
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Start or replay Join your team" }));
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(await screen.findByText(/did not sync \(completed tutorial\)/i)).toBeInTheDocument();
    actions.save.mockResolvedValue({ ok: true, progress: { tourId: "joining", version: 1, status: "completed", nextStep: "request", updatedAt: new Date().toISOString() } });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(/did not sync \(completed tutorial\)/i)).not.toBeInTheDocument());
    expect(actions.save).toHaveBeenLastCalledWith(expect.objectContaining({ tourId: "joining", status: "completed", nextStep: "request" }));
  });

  it("opens from the character, traps focus in Help, restores the launcher, and leaves tour targets interactive", async () => {
    const user = userEvent.setup();
    const onTargetClick = vi.fn();
    navigation.pathname = "/profile";
    renderWooly(teammate, "profile", onTargetClick);
    const launcher = await screen.findByRole("button", { name: "Wooly" });
    const character = launcher.querySelector<HTMLElement>(".wooly-mascot")!;
    expect(character).toHaveAttribute("data-pose", "listening");
    expect(character).toHaveAttribute("data-paused", "false");
    await user.click(launcher);
    expect(screen.getByRole("button", { name: "Close Wooly" })).toHaveFocus();
    expect(character).toHaveAttribute("data-paused", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Help with Wooly" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
    expect(character).toHaveAttribute("data-paused", "false");

    await user.click(launcher);
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Start or replay Your Sunday Setlist essentials" }));
    expect(await screen.findByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page content" }));
    expect(onTargetClick).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Wooly guided tour" })).not.toBeInTheDocument();
  });

  it("does not replace an active help tour when the delayed offer save resolves", async () => {
    const user = userEvent.setup();
    let resolveOffer: ((value: { ok: true; progress: { tourId: string; version: number; status: string; nextStep: string; updatedAt: string } }) => void) | undefined;
    actions.save.mockImplementation((input: { status: string; tourId: string; version: number; nextStep: string }) => {
      if (input.status === "offered") return new Promise((resolve) => { resolveOffer = resolve; });
      return Promise.resolve({ ok: true, progress: { ...input, updatedAt: new Date().toISOString() } });
    });
    renderWooly(newMember);
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "joining", status: "offered" })));
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Start or replay Join your team" }));
    expect(await screen.findByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    resolveOffer?.({ ok: true, progress: { tourId: "joining", version: 1, status: "offered", nextStep: "welcome", updatedAt: new Date().toISOString() } });
    expect(await screen.findByRole("heading", { name: "Hi, I’m Wooly!" })).toBeInTheDocument();
    expect(screen.queryByText("Would you like a short tour?")).not.toBeInTheDocument();
  });

  it("clears a selected manager topic immediately when member-management permission is revoked", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/members";
    const manager: WoolyAudience = { userId: "manager-1", hasTeam: true, canManageMembers: true };
    const view = renderWooly(manager, "members");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "How do I manage members?" }));
    expect(screen.getByText(/member-management permission controls requests/i)).toBeInTheDocument();
    const member = { ...manager, canManageMembers: false };
    view.rerender(<WoolyProvider><WoolyScreen audience={member} /><button data-wooly-target="members">Page content</button></WoolyProvider>);
    expect(screen.queryByText(/member-management permission controls requests/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "How do I manage members?" })).not.toBeInTheDocument();
  });

  it("keeps the active tour through an eligible route gap until the same user screen registers", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/dashboard";
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "essentials", version: 1, status: "paused", nextStep: "welcome", updatedAt: new Date().toISOString() }] });
    const view = renderWooly(teammate, "home");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Your Sunday Setlist essentials" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    navigation.pathname = "/setlists";
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...teammate }} /><button data-wooly-target="home">Previous page</button></WoolyProvider>);
    view.rerender(<WoolyProvider><button data-wooly-target="setlists">Page content</button></WoolyProvider>);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Setlists: prepare your songs" })).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 25));
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...teammate }} /><button data-wooly-target="setlists">Page content</button></WoolyProvider>);
    expect(screen.getByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Setlists: prepare your songs" })).toBeInTheDocument();
  });

  it("does not consume a pending route when an old step effect or screen registration runs late", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/dashboard";
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "essentials", version: 1, status: "paused", nextStep: "welcome", updatedAt: new Date().toISOString() }] });
    const view = renderWooly(teammate, "home");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Your Sunday Setlist essentials" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Model the outgoing Home screen's delayed effect while Next is already routing to Setlists.
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...teammate, canManageMembers: true }} /><button data-wooly-target="home">Previous page</button></WoolyProvider>);
    navigation.pathname = "/setlists";
    view.rerender(<WoolyProvider><button data-wooly-target="setlists">Page content</button></WoolyProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Setlists: prepare your songs" })).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
  });

  it("clears the retained account when an eligible route gap redirects to an unsupported route", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/dashboard";
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "essentials", version: 1, status: "paused", nextStep: "welcome", updatedAt: new Date().toISOString() }] });
    const view = renderWooly(teammate, "home");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Your Sunday Setlist essentials" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    navigation.pathname = "/setlists";
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...teammate }} /><button data-wooly-target="home">Previous page</button></WoolyProvider>);
    view.rerender(<WoolyProvider><button data-wooly-target="setlists">Page content</button></WoolyProvider>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();

    navigation.pathname = "/not-a-website-page";
    view.rerender(<WoolyProvider><button data-wooly-target="setlists">Page content</button></WoolyProvider>);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Wooly guided tour" })).not.toBeInTheDocument();
  });

  it("clears the retained account when the next eligible screen has no authenticated user", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/dashboard";
    actions.read.mockResolvedValue({ ok: true, progress: [{ tourId: "essentials", version: 1, status: "paused", nextStep: "welcome", updatedAt: new Date().toISOString() }] });
    const view = renderWooly(teammate, "home");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Your Sunday Setlist essentials" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    navigation.pathname = "/setlists";
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...teammate }} /><button data-wooly-target="home">Previous page</button></WoolyProvider>);
    view.rerender(<WoolyProvider><button data-wooly-target="setlists">Page content</button></WoolyProvider>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();

    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...teammate, userId: "" }} /><button data-wooly-target="setlists">Page content</button></WoolyProvider>);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Wooly guided tour" })).not.toBeInTheDocument();
  });

  it("guides the current record without navigating to fabricated IDs, then saves and resumes its step", async () => {
    navigation.pathname = "/songs/actual-song";
    const user = userEvent.setup();
    renderWooly(teammate, "song-heading");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Show me this page" }));
    expect(screen.getByRole("heading", { name: "Meet this song" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(document.querySelector('.wooly-companion .wooly-mascot-still')).toHaveAttribute("src", "/brand/wooly/whole-pointing-v1.webp");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Close Wooly" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "page-song-detail", nextStep: "step-2", status: "paused" })));
    await user.click(screen.getByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Song chart" }));
    expect(screen.getByRole("heading", { name: "Adjust your view" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "page-song-detail", nextStep: "step-3", status: "completed" })));
  });

  it.each(["/", "/login", "/dashboard"])("hides Wooly for a guest on %s without reading or saving progress", (path) => {
    navigation.pathname = path;
    renderWooly({ ...newMember, userId: "public", session: "guest" });
    expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument();
    expect(actions.read).not.toHaveBeenCalled();
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("removes open help immediately when navigating from an account page to login", async () => {
    navigation.pathname = "/dashboard";
    const view = renderWooly({ ...teammate, session: "account" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    expect(screen.getByRole("dialog", { name: "Help with Wooly" })).toBeVisible();
    navigation.pathname = "/login";
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...teammate, session: "account" }} /></WoolyProvider>);
    expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Help with Wooly" })).not.toBeInTheDocument();
  });

  it("scrolls phone targets to the top so the tutorial sheet can sit below them", async () => {
    navigation.pathname = "/profile";
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 640px)", media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const user = userEvent.setup();
    try {
      renderWooly(teammate, "profile-details");
      const target = screen.getByRole("button", { name: "Page content" });
      const rectangle = new DOMRect(16, 16, 280, 40);
      vi.spyOn(target, "getClientRects").mockReturnValue({
        0: rectangle, length: 1, item: () => rectangle,
        [Symbol.iterator]: () => [rectangle][Symbol.iterator](),
      });
      const scroll = vi.fn();
      target.scrollIntoView = scroll;
      await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
      await user.click(screen.getByRole("button", { name: "Show me this page" }));
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
    } finally { vi.unstubAllGlobals(); }
  });

  it("keeps the spotlight around Search setlists after the page finishes moving", async () => {
    navigation.pathname = "/setlists";
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)", media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    try {
      const user = userEvent.setup();
      renderWooly(teammate, "setlist-search");
      const target = screen.getByRole("button", { name: "Page content" });
      let rectangle = new DOMRect(766, 130, 256, 40);
      vi.spyOn(target, "getClientRects").mockImplementation(() => Object.assign([rectangle], { item: () => rectangle }));
      vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => rectangle);
      target.scrollIntoView = vi.fn();
      await user.click(await screen.findByRole("button", { name: "Wooly" }));
      await user.click(screen.getByRole("button", { name: "Tutorials" }));
      await user.click(screen.getByRole("button", { name: "Show me this page" }));
      const spotlight = () => document.querySelector(".wooly-spotlight");
      await waitFor(() => expect(spotlight()).toHaveStyle({ left: "760px", top: "124px", width: "268px", height: "52px" }));
      rectangle = new DOMRect(766, 100, 256, 40);
      await waitFor(() => expect(spotlight()).toHaveStyle({ top: "94px", height: "52px" }));
      expect(target.scrollIntoView).toHaveBeenCalledOnce();
      await user.click(screen.getByRole("button", { name: "Close Wooly" }));
      expect(spotlight()).not.toBeInTheDocument();
    } finally { vi.unstubAllGlobals(); }
  });

  it("pauses a dynamic guide when a different record is opened", async () => {
    navigation.pathname = "/songs/first-song";
    const user = userEvent.setup();
    const view = renderWooly(teammate, "song-heading");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Show me this page" }));
    navigation.pathname = "/songs/second-song";
    view.rerender(<WoolyProvider><WoolyScreen audience={teammate} /><button data-wooly-target="song-heading">Page content</button></WoolyProvider>);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Wooly guided tour" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Resume Song chart" }));
    expect(screen.getByRole("heading", { name: "Meet this song" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("pauses a permission-specific step immediately when the effective permission is removed", async () => {
    navigation.pathname = "/messages";
    const user = userEvent.setup();
    const sender: WoolyAudience = { ...teammate, permissions: ["messages.send"] };
    const view = renderWooly(sender, "message-compose");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Show me this page" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Write your reply" })).toBeInTheDocument();
    view.rerender(<WoolyProvider><WoolyScreen audience={{ ...sender, permissions: [] }} /><button data-wooly-target="message-search">Page content</button></WoolyProvider>);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Write your reply" })).not.toBeInTheDocument());
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ tourId: "page-messages", status: "paused", nextStep: "step-3" }));
  });

  it("keeps normal audience outputs clear and opens output guides only by explicit request", async () => {
    navigation.pathname = "/setlists/service-1/projector";
    const view = renderWooly(teammate, "projector-output");
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: "Wooly" })).not.toBeInTheDocument();
    window.history.replaceState(null, "", "/?wooly=1");
    view.rerender(<WoolyProvider><WoolyScreen audience={teammate} /><button data-wooly-target="projector-output">Page content</button></WoolyProvider>);
    expect(await screen.findByRole("button", { name: "Wooly" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/");
  });

  it("keeps tutorial keyboard interactions from firing live page shortcuts", async () => {
    navigation.pathname = "/profile";
    const user = userEvent.setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    try {
      renderWooly(teammate, "profile-details");
      await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
      await user.click(screen.getByRole("button", { name: "Show me this page" }));
      screen.getByRole("button", { name: "Next" }).focus();
      await user.keyboard(" ");
      expect(shortcut).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Save your profile" })).toBeInTheDocument();
    } finally { window.removeEventListener("keydown", shortcut); }
  });

  it("clears an already-open panel on output navigation and on same-page opt-out", async () => {
    navigation.pathname = "/profile";
    const user = userEvent.setup();
    const view = renderWooly(teammate, "profile-details");
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    navigation.pathname = "/setlists/service-1/confidence";
    view.rerender(<WoolyProvider><WoolyScreen audience={teammate} /><button data-wooly-target="confidence-output">Page content</button></WoolyProvider>);
    expect(screen.queryByRole("dialog", { name: "Help with Wooly" })).not.toBeInTheDocument();
    window.history.replaceState(null, "", "/?wooly=1");
    view.rerender(<WoolyProvider><WoolyScreen audience={teammate} /><button data-wooly-target="confidence-output">Page content</button></WoolyProvider>);
    await user.click(await screen.findByRole("button", { name: "Wooly" }));
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: "Show me this page" }));
    expect(screen.getByRole("region", { name: "Wooly guided tour" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/");
    view.rerender(<WoolyProvider><WoolyScreen audience={teammate} /><button data-wooly-target="confidence-output">Page content</button></WoolyProvider>);
    expect(screen.queryByRole("region", { name: "Wooly guided tour" })).not.toBeInTheDocument();
    expect(document.querySelector(".wooly-spotlight")).not.toBeInTheDocument();
  });
});
