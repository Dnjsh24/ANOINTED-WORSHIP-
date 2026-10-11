import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HelpArticle, SupportMessage, SupportRequest } from "@/lib/domain/wooly-chat";
const mocks = vi.hoisted(() => ({ save: vi.fn(), reply: vi.fn(), status: vi.fn(), list: vi.fn(), read: vi.fn() }));
vi.mock("@/app/wooly-support-actions", () => ({ saveWoolyHelpArticleAction: mocks.save, replyWoolyThreadAction: mocks.reply, setWoolyRequestStatusAction: mocks.status, listWoolySupportInboxAction: mocks.list, readWoolyThreadAction: mocks.read }));
import { WoolyArticleEditor } from "./wooly-article-editor";
import { WoolyThread } from "./wooly-thread";
import { WoolySupportInbox } from "./wooly-support-inbox";
const request: SupportRequest = { id: "request-a", profile_id: "a", team_id: null, question: "Question", details: "Details", page_path: "/profile", status: "closed", created_at: "2026-10-11T00:00:00Z", updated_at: "2026-10-11T00:00:00Z", requester_read_at: "2026-10-11T00:00:00Z", support_updated_at: null };
const message: SupportMessage = { id: "m", request_id: request.id, author_id: "support", author_kind: "support", body: "Private reply", created_at: request.created_at };
const article: HelpArticle = { id: "article-a", title: "Joining", keywords: "joining code", answer: "Ask your leader for a code.", audience: "everyone", published: true, route: "/teams/join", created_by: "support", updated_at: request.created_at };
beforeEach(() => {
  vi.resetAllMocks(); mocks.save.mockResolvedValue({ ok: true, data: "article-a" }); mocks.reply.mockResolvedValue({ ok: true, data: "m" }); mocks.status.mockResolvedValue({ ok: true, data: null });
  mocks.list.mockResolvedValue({ ok: true, data: { requests: [request], articles: [article] } }); mocks.read.mockResolvedValue({ ok: true, data: { request, messages: [message] } });
});
describe("private support and explicit publication", () => {
  it("creates an editable draft from a private reply without publishing", async () => {
    render(<WoolySupportInbox />); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Question/ }));
    await user.click(await screen.findByRole("button", { name: "Create reusable answer" }));
    expect(screen.getByLabelText("Answer")).toHaveValue("Private reply");
    expect(screen.getByRole("heading", { name: "New reusable answer draft" })).toHaveFocus();
    expect(screen.getByText("Unpublished draft")).toBeVisible(); expect(mocks.save).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Title"), "General answer"); await user.type(screen.getByLabelText("Keywords"), "general answer");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ published: false }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ published: true }));
  });
  it("unpublishes an existing article explicitly and retains a failed edit", async () => {
    mocks.save.mockResolvedValueOnce({ ok: false, message: "Offline" }).mockResolvedValueOnce({ ok: true, data: article.id });
    render(<WoolyArticleEditor article={article} onSaved={vi.fn()} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByLabelText("Answer")).toHaveValue(article.answer);
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved");
    expect(mocks.save.mock.calls[0][0].id).toBe(mocks.save.mock.calls[1][0].id);
  });
  it("a follow-up to a closed question uses the same retry ID and stays private", async () => {
    mocks.reply.mockResolvedValueOnce({ ok: false, message: "Not saved" }).mockResolvedValueOnce({ ok: true, data: "m" });
    const changed = vi.fn(); render(<WoolyThread request={request} messages={[message]} onChange={changed} />); const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: "Create reusable answer" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Support replies" })).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Sending a follow-up will reopen your question.")).toBeVisible();
    await user.type(screen.getByLabelText("Reply"), "A follow-up"); await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved"); expect(changed).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(mocks.reply.mock.calls[0][0]).toEqual(mocks.reply.mock.calls[1][0]); expect(mocks.reply.mock.calls[0][0].asSupport).toBe(false);
  });
  it("support can reopen and users can close, with save errors visible", async () => {
    const changed = vi.fn(); render(<WoolyThread request={request} messages={[]} asSupport onChange={changed} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Reopen question" }));
    expect(mocks.status).toHaveBeenCalledWith(request.id, "open", true);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("shows inbox load failures instead of a successful queue state", async () => {
    mocks.list.mockResolvedValue({ ok: false, message: "Access unavailable" }); render(<WoolySupportInbox />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Access unavailable"); expect(screen.getByRole("button", { name: "Retry inbox" })).toBeVisible();
  });
});
