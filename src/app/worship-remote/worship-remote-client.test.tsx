import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorshipRemoteClient from "./worship-remote-client";

const mocks = vi.hoisted(() => ({
  claimPin: vi.fn(),
  claimToken: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

vi.mock("@/app/presenter/remote-pairing-actions", () => ({
  claimCloudRemotePairing: mocks.claimToken,
  claimCloudRemotePairingByPin: mocks.claimPin,
}));

describe("Worship Remote pairing screen", () => {
  beforeEach(() => {
    mocks.claimPin.mockReset();
    mocks.claimToken.mockReset();
    mocks.replace.mockReset();
    mocks.push.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/worship-remote");
  });

  it("normalizes a pasted PIN and opens the claimed session", async () => {
    mocks.claimPin.mockResolvedValue({ ok: true, sessionId: "session-1" });
    render(<WorshipRemoteClient />);

    const input = screen.getByLabelText("Six-digit pairing code");
    fireEvent.change(input, { target: { value: "12 3-45a6" } });
    expect(input).toHaveValue("123456");
    fireEvent.click(screen.getByRole("button", { name: "Connect to Presenter" }));

    await waitFor(() => expect(mocks.claimPin).toHaveBeenCalledWith("123456"));
    expect(mocks.replace).toHaveBeenCalledWith("/worship-remote/session/session-1");
  });

  it("offers camera scanning and explains the secure fallback", () => {
    render(<WorshipRemoteClient />);
    expect(screen.getByRole("button", { name: "Scan QR Code" })).toBeInTheDocument();
    expect(screen.getByText(/camera permission/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Windows Presenter/i).length).toBeGreaterThan(0);
  });

  it("closes the QR scanner with Escape and restores focus", async () => {
    render(<WorshipRemoteClient />);
    const opener = screen.getByRole("button", { name: "Scan QR Code" });
    opener.focus();
    fireEvent.click(opener);

    const closeButton = screen.getByRole("button", { name: "Close QR scanner" });
    await waitFor(() => expect(closeButton).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps a QR pairing in session storage when sign-in is required", async () => {
    const sessionId = "2fba2e5d-ae65-4c8c-a434-bc2016795c9b";
    const token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const pair = `${sessionId}.${token}`;
    mocks.claimToken.mockResolvedValue({ ok: false, code: "auth_required", message: "Sign in required." });
    window.history.replaceState(null, "", `/worship-remote#pair=${pair}`);

    render(<WorshipRemoteClient />);

    await waitFor(() => expect(mocks.claimToken).toHaveBeenCalledWith(pair));
    expect(window.sessionStorage.getItem("anointed-worship-pending-remote-pairing")).toBe(pair);
    expect(mocks.push).toHaveBeenCalledWith("/login?next=%2Fworship-remote");
  });
});
