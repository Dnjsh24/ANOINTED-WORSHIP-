import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

function Fixture({ onClose, hiddenWrapper = false }: { onClose: () => void; hiddenWrapper?: boolean }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useAccessibleDialog({
    open,
    onClose: () => {
      setOpen(false);
      onClose();
    },
  });

  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      {open ? (
        <div style={hiddenWrapper ? { display: "none" } : undefined}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
          <h2 id="dialog-title">Settings</h2>
          <input type="hidden" value="private-form-id" readOnly />
          <div hidden><button>Hidden ancestor</button></div>
          <div style={{ display: "none" }}><button>CSS hidden</button></div>
          <div inert><button>Inert ancestor</button></div>
          <button tabIndex={-2}>Skipped tabindex</button>
          <button>First</button>
          <a href="/profile">Middle link</a>
          <button>Last</button>
        </div>
        </div>
      ) : null}
    </>
  );
}

describe("useAccessibleDialog", () => {
  it("excludes controls inside a CSS-hidden wrapper outside the dialog", async () => {
    const user = userEvent.setup();
    render(<Fixture onClose={vi.fn()} hiddenWrapper />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Settings", hidden: true });
    expect(dialog).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(dialog).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
  it("moves focus into the dialog, traps Tab, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    await user.click(trigger);

    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));

    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Middle link" }));

    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(last);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Middle link" }));

    screen.getByRole("button", { name: "First" }).focus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(last);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });
});
