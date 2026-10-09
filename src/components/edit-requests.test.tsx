import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SharedEditRequestRow } from "@/lib/domain/shared-edit-requests";
const actions = vi.hoisted(() => ({ submit: vi.fn(), load: vi.fn(), review: vi.fn(), withdraw: vi.fn() }));
vi.mock("@/app/edit-request-actions", () => ({ submitSharedEditRequestAction: actions.submit, loadSharedEditRequestsAction: actions.load, reviewSharedEditRequestAction: actions.review, withdrawSharedEditRequestAction: actions.withdraw }));
import { SharedContentRequestForm } from "./shared-content-request-form";
import { EditRequestInbox } from "./edit-request-inbox";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row: SharedEditRequestRow = { id: id(1), team_id: id(2), target_type: "song", target_id: id(3), base_revision: 4, changes: { title: "New title" }, before_snapshot: { title: "Original" }, after_snapshot: null, reason: "Correct title", status: "pending", requested_by: id(4), reviewed_by: null, review_reason: null, requested_at: "2026-10-06T09:00:00Z", reviewed_at: null, request_nonce: id(5), legacy_song_request_id: null };
beforeEach(() => { vi.clearAllMocks(); actions.submit.mockResolvedValue({ ok: false, message: "Retry" }); actions.load.mockResolvedValue({ ok: true, requests: [], nextCursor: null }); actions.review.mockResolvedValue({ ok: true, message: "Approved" }); });
it("gives owners only the review queue and refreshes that queue", async () => {
  const user = userEvent.setup();
  render(<EditRequestInbox initial={{ ok: true, requests: [row], nextCursor: null }} userId={id(6)} role="owner" names={{}} />);
  expect(screen.queryByRole("button", { name: "My requests" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Request changes" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review queue" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(actions.load).toHaveBeenCalledWith({ view: "review" }));
});
it("keeps My requests for members", () => {
  render(<EditRequestInbox initial={{ ok: true, requests: [], nextCursor: null }} userId={id(6)} role="member" names={{}} />);
  expect(screen.getByRole("button", { name: "My requests" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("link", { name: "Request changes" })).toBeInTheDocument();
});
it("uses the owner's per-person permission decision for setlist reviews", () => {
  render(<EditRequestInbox initial={{ ok: true, requests: [{ ...row, target_type: "setlist" }], nextCursor: null }} userId={id(6)} role="member" permissionOverrides={{ "setlists.manage": true }} names={{}} />);
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
});
it("removes setlist approval controls from an explicitly denied admin", () => {
  render(<EditRequestInbox initial={{ ok: true, requests: [{ ...row, target_type: "setlist" }], nextCursor: null }} userId={id(6)} role="admin" permissionOverrides={{ "setlists.manage": false }} names={{}} />);
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
});
it("keeps the draft and nonce on a failed retry, then changes nonce for a new proposal", async () => {
  const user = userEvent.setup();
  render(<SharedContentRequestForm type="announcement" targetId={id(3)} revision={4} values={{ title: "Original", body: "Hello", is_pinned: false }} />);
  await user.clear(screen.getByRole("textbox", { name: /^title$/i }));
  await user.type(screen.getByRole("textbox", { name: /^title$/i }), "New title");
  await user.type(screen.getByRole("textbox", { name: "Reason for these changes" }), "Correction");
  await user.click(screen.getByRole("button", { name: "Submit edit request" }));
  await waitFor(() => expect(actions.submit).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole("button", { name: "Submit edit request" }));
  await waitFor(() => expect(actions.submit).toHaveBeenCalledTimes(2));
  expect(actions.submit.mock.calls[0][0]).toEqual(actions.submit.mock.calls[1][0]);
  expect(screen.getByRole("textbox", { name: /^title$/i })).toHaveValue("New title");
  await user.type(screen.getByRole("textbox", { name: /^title$/i }), " revised");
  await user.click(screen.getByRole("button", { name: "Submit edit request" }));
  await waitFor(() => expect(actions.submit).toHaveBeenCalledTimes(3));
  expect(actions.submit.mock.calls[2][0].requestNonce).not.toBe(actions.submit.mock.calls[0][0].requestNonce);
});
it("does not offer self approval even to an owner", () => {
  render(<EditRequestInbox initial={{ ok: true, requests: [row], nextCursor: null }} userId={id(4)} role="owner" names={{}} />);
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Withdraw request" })).toBeInTheDocument();
});
it("retains the proposal and nonce when submission rejects", async () => {
  actions.submit.mockRejectedValueOnce(new Error("Offline"));
  const user = userEvent.setup();
  render(<SharedContentRequestForm type="announcement" targetId={id(3)} revision={4} values={{ title: "Original", body: "Hello" }} />);
  await user.type(screen.getByRole("textbox", { name: /^title$/i }), " revised");
  await user.type(screen.getByRole("textbox", { name: "Reason for these changes" }), "Keep the cue");
  await user.click(screen.getByRole("button", { name: "Submit edit request" }));
  await screen.findByText(/Your draft is retained/);
  expect(screen.getByRole("textbox", { name: /^title$/i })).toHaveValue("Original revised");
  await user.click(screen.getByRole("button", { name: "Submit edit request" }));
  await waitFor(() => expect(actions.submit).toHaveBeenCalledTimes(2));
  expect(actions.submit.mock.calls[1][0]).toEqual(actions.submit.mock.calls[0][0]);
});
it("retains the review reason when a decision rejects", async () => {
  actions.review.mockRejectedValueOnce(new Error("Offline"));
  const user = userEvent.setup();
  render(<EditRequestInbox initial={{ ok: true, requests: [row], nextCursor: null }} userId={id(6)} role="admin" names={{}} />);
  const note = screen.getByRole("textbox", { name: "Review note (required when rejecting)" });
  await user.type(note, "Please include the artist");
  await user.click(screen.getByRole("button", { name: "Reject" }));
  await screen.findByText(/The decision could not be confirmed/);
  expect(note).toHaveValue("Please include the artist");
  expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
});
it("requires a rejection reason and shows the before and proposed values", async () => {
  const user = userEvent.setup();
  render(<EditRequestInbox initial={{ ok: true, requests: [row], nextCursor: null }} userId={id(6)} role="admin" names={{ [id(4)]: "Dana" }} />);
  expect(screen.getByText("Original")).toBeInTheDocument();
  expect(screen.getByText("New title")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "Review note (required when rejecting)" }), "Please include the artist");
  await user.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() => expect(actions.review).toHaveBeenCalledWith({ requestId: id(1), decision: "rejected", reason: "Please include the artist" }));
});
it("does not grant song review through a custom songs.review permission", () => {
  render(<EditRequestInbox initial={{ ok: true, requests: [row], nextCursor: null }} userId={id(6)} role="member" permissions={["songs.review"]} names={{}} />);
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
});
it("proposes setlist order and leadership using named choices", async () => {
  const user = userEvent.setup();
  render(<SharedContentRequestForm type="setlist" targetId={id(3)} revision={4} values={{ name: "Sunday", leader_member_id: null, song_ids: [id(7), id(8)] }} members={[{ id: id(6), name: "Dana" }]} songs={[{ id: id(7), name: "Opening" }, { id: id(8), name: "Closing" }]} />);
  await user.selectOptions(screen.getByRole("combobox", { name: /leader member id/i }), id(6));
  await user.click(screen.getByRole("button", { name: "Move song 2 up" }));
  await user.type(screen.getByRole("textbox", { name: "Reason for these changes" }), "Lead and order update");
  await user.click(screen.getByRole("button", { name: "Submit edit request" }));
  await waitFor(() => expect(actions.submit).toHaveBeenCalledWith(expect.objectContaining({ changes: { leader_member_id: id(6), song_ids: [id(8), id(7)] } })));
});
