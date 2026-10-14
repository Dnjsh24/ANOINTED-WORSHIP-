import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WoolyAudience } from "@/lib/domain/wooly";
import type { SupportRequest, WoolyReply } from "@/lib/domain/wooly-chat";
const mocks = vi.hoisted(() => ({ answer: vi.fn(), list: vi.fn(), read: vi.fn(), submit: vi.fn(), reply: vi.fn(), status: vi.fn() }));
vi.mock("@/app/wooly-chat-actions", () => ({ answerWoolyQuestionAction: mocks.answer }));
vi.mock("@/app/wooly-support-actions", () => ({ listMyWoolyRequestsAction: mocks.list, readWoolyThreadAction: mocks.read, submitWoolyRequestAction: mocks.submit, replyWoolyThreadAction: mocks.reply, setWoolyRequestStatusAction: mocks.status }));
import { useWoolyChat, woolyIdentity } from "./use-wooly-chat";
import { useWoolyQuestions } from "./use-wooly-questions";
import { WoolyHelpViews } from "./wooly-help-views";

const member: WoolyAudience = { userId: "a", teamId: "team-a", hasTeam: true, canManageMembers: false, session: "account" };
const request: SupportRequest = { id: "8a06a13c-ea9a-48ee-bf80-a0772a1883c6", profile_id: "a", team_id: "team-a", question: "Why is this missing?", details: "", page_path: "/profile", status: "open", created_at: "2026-10-11T00:00:00Z", updated_at: "2026-10-11T00:00:00Z", requester_read_at: "2026-10-11T00:00:00Z", support_updated_at: null };
function Harness({ audience = member, path = "/profile" }: { audience?: WoolyAudience; path?: string }) {
  const chat = useWoolyChat(audience, path);
  const questions = useWoolyQuestions(audience, true, path, chat.view === "questions");
  return <WoolyHelpViews audience={audience} chat={chat} questions={questions} onTour={vi.fn()}><p>Tutorial catalog</p></WoolyHelpViews>;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.answer.mockResolvedValue({ kind: "answer", text: "Use the existing page controls.", sources: [{ label: "Open Profile", href: "/profile" }] });
  mocks.list.mockResolvedValue({ ok: true, data: { requests: [], isSupport: false, unread: 0 } });
  mocks.read.mockResolvedValue({ ok: true, data: { request, messages: [] } });
});
afterEach(() => vi.useRealTimers());

describe("Wooly's chat and personal support views", () => {
  it("expands saved steps and sends only the last confirmed topic as context", async () => {
    mocks.answer.mockResolvedValue({ kind: "answer", text: "Use the song library.", sources: [], steps: ["Open Songs.", "Enter a title in Search songs."], confirmedTopicId: "song-search" });
    const { result, rerender } = renderHook(({ audience }) => useWoolyChat(audience, "/songs"), { initialProps: { audience: member } });
    await act(async () => result.current.send("Find a song"));
    await act(async () => result.current.send("What next?"));
    expect(mocks.answer).toHaveBeenLastCalledWith(expect.objectContaining({ confirmedTopicId: "song-search" }));
    expect(mocks.answer.mock.calls[1][0]).not.toHaveProperty("messages");
    rerender({ audience: { ...member, teamId: "other" } });
    await act(async () => {});
    await act(async () => result.current.send("Hello"));
    expect(mocks.answer.mock.calls[2][0]).not.toHaveProperty("confirmedTopicId");
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole("button", { name: "How do I use setlists?" }));
    const summary = await screen.findByText("View steps");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Enter a title in Search songs.")).toBeVisible();
  });
  it("normalizes public and pre-team identities without granting team permissions", () => {
    expect(woolyIdentity({ ...member, hasTeam: false, teamId: null })).toBe(woolyIdentity({ ...member, hasTeam: false, teamId: null, permissions: ["messages.send"] }));
    expect(woolyIdentity({ ...member, userId: "wooly-public", hasTeam: false, teamId: null, session: "guest" })).toBe(woolyIdentity({ ...member, userId: "guest", hasTeam: false, teamId: null, session: "guest" }));
  });
  it("shows suggestions, sends on the form and retains chat over route changes", async () => {
    const user = userEvent.setup(); const view = render(<Harness />);
    expect(screen.getByRole("button", { name: "How do I use setlists?" })).toBeVisible();
    await user.type(screen.getByLabelText("Your question"), "How do I use my profile?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("link", { name: "Open Profile" })).toHaveAttribute("href", "/profile");
    expect(mocks.answer).toHaveBeenCalledWith(expect.objectContaining({ pagePath: "/profile" }));
    view.rerender(<Harness path="/songs" />);
    expect(screen.getByText("How do I use my profile?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(screen.getByText("Tutorial catalog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByText("How do I use my profile?")).toBeVisible();
  });
  it("clears chat and drafts after account/team or permission changes", async () => {
    const { result, rerender } = renderHook(({ audience }) => useWoolyChat(audience, "/songs"), { initialProps: { audience: member } });
    await act(async () => { await result.current.send("Find song Grace"); result.current.setDraft("private draft"); });
    expect(result.current.messages).toHaveLength(1);
    rerender({ audience: { ...member, teamId: "team-b" } });
    await waitFor(() => expect(result.current.messages).toHaveLength(0));
    expect(result.current.draft).toBe("");
    await act(async () => { await result.current.send("Hello"); });
    rerender({ audience: { ...member, teamId: "team-b", permissions: ["songs.edit"] } });
    expect(result.current.messages).toHaveLength(0);
  });
  it("discards late replies from the previous account", async () => {
    let finish: (value: WoolyReply) => void = () => undefined;
    mocks.answer.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ audience }) => useWoolyChat(audience, "/songs"), { initialProps: { audience: member } });
    act(() => { void result.current.send("Find song Grace"); });
    rerender({ audience: { ...member, userId: "b" } });
    await act(async () => finish({ kind: "answer", text: "Secret from account a", sources: [] }));
    expect(result.current.messages).toEqual([]);
  });
  it("clears chat when the server sees a different signed-in account", async () => {
    const changed = vi.fn(); mocks.answer.mockResolvedValue({ kind: "answer", text: "New account records", sources: [], audience: { ...member, userId: "b" } });
    const { result } = renderHook(() => useWoolyChat(member, "/songs", changed));
    await act(async () => result.current.send("Find song Grace"));
    expect(changed).toHaveBeenCalledTimes(1); expect(result.current.messages).toEqual([]);
  });
  it("offers clarification choices and retries an unavailable answer", async () => {
    mocks.answer.mockResolvedValueOnce({ kind: "clarification", text: "Choose", choices: [{ label: "Profile help", value: { kind: "topic", id: "profile" } }] }).mockResolvedValueOnce({ kind: "unavailable", text: "Offline" });
    render(<Harness />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "How do I use setlists?" }));
    await user.click(await screen.findByRole("button", { name: "Profile help" }));
    expect(mocks.answer).toHaveBeenLastCalledWith(expect.objectContaining({ choice: { kind: "topic", id: "profile" } }));
    await user.click(await screen.findByRole("button", { name: "Retry question" }));
    expect(mocks.answer).toHaveBeenCalledTimes(3);
  });
  it("reviews an unknown question, retains failed drafts and reuses the retry ID", async () => {
    mocks.answer.mockResolvedValue({ kind: "unknown", text: "I don’t know this yet." });
    mocks.submit.mockResolvedValueOnce({ ok: false, message: "Not saved" }).mockResolvedValueOnce({ ok: true, data: request.id });
    render(<Harness />); const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), request.question);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Ask website support" }));
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Question")).toHaveValue(request.question);
    await user.type(screen.getByLabelText("Details (optional)"), "My details");
    await user.click(screen.getByRole("button", { name: "Send to support" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
    expect(screen.queryByText("Your question was sent to website support.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Details (optional)")).toHaveValue("My details");
    await user.click(screen.getByRole("button", { name: "Retry sending to support" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your question was sent");
    expect(mocks.submit.mock.calls[0][0]).toEqual(mocks.submit.mock.calls[1][0]);
    expect(Object.keys(mocks.submit.mock.calls[0][0]).sort()).toEqual(["details", "expectedProfileId", "id", "pagePath", "question"]);
  });
  it.each(["guest", "demo"] as const)("%s cannot submit real support requests", async (session) => {
    render(<Harness audience={{ ...member, session }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "My questions" }));
    expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send to support" })).not.toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("refreshes badges on focus and every 30 seconds while visible", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ visible }) => useWoolyQuestions(member, visible, "/profile"), { initialProps: { visible: true } });
    await act(async () => {});
    const initial = mocks.list.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(mocks.list).toHaveBeenCalledTimes(initial + 1);
    fireEvent(window, new Event("focus")); await act(async () => {});
    expect(mocks.list).toHaveBeenCalledTimes(initial + 2);
    rerender({ visible: false }); await act(async () => {});
    const closed = mocks.list.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(mocks.list).toHaveBeenCalledTimes(closed);
  });
  it("clears personal questions and ignores a stale list after sign out", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.list.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ audience }) => useWoolyQuestions(audience, true, "/profile"), { initialProps: { audience: member } });
    await act(async () => {});
    rerender({ audience: { ...member, session: "guest" } });
    await act(async () => finish({ ok: true, data: { requests: [request], isSupport: true, unread: 1 } }));
    expect(result.current.requests).toEqual([]); expect(result.current.isSupport).toBe(false);
  });
  it.each(["changed", "signed-out"])("revalidates a %s session on refocus before showing personal data", async (mode) => {
    const changed = vi.fn();
    mocks.list.mockResolvedValue(mode === "changed" ? { ok: true, data: { requests: [request], unread: 1, isSupport: false, audience: { ...member, userId: "b" } } } : { ok: false, code: "session", message: "Sign in required" });
    const { result } = renderHook(() => useWoolyQuestions(member, true, "/profile", true, changed));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(result.current.requests).toEqual([]); expect(result.current.unread).toBe(0);
  });
  it("loads older questions and keeps the all-history unread count", async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({ ...request, id: `request-${index}` }));
    mocks.list.mockResolvedValueOnce({ ok: true, data: { requests: first, unread: 55, isSupport: false } }).mockResolvedValue({ ok: true, data: { requests: [request], unread: 55, isSupport: false } });
    const { result } = renderHook(() => useWoolyQuestions(member, true, "/profile"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => result.current.loadMore());
    expect(mocks.list).toHaveBeenLastCalledWith(50); expect(result.current.requests).toHaveLength(51); expect(result.current.unread).toBe(55); expect(result.current.hasMore).toBe(false);
  });
  it("does not let a list refresh cancel a pending conversation read", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.read.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useWoolyQuestions(member, true, "/profile"));
    await act(async () => {});
    act(() => { void result.current.openThread(request.id); });
    await act(async () => result.current.refresh());
    await act(async () => finish({ ok: true, data: { request, messages: [] } }));
    expect(result.current.thread?.request.id).toBe(request.id); expect(result.current.pending).toBe(false);
    act(() => result.current.closeThread()); expect(result.current.thread).toBeNull();
  });
});
