import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

function Fixture({ onClose }: { onClose: () => void }) {
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
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
          <h2 id="dialog-title">Settings</h2>
          <button>First</button>
          <button>Last</button>
        </div>
      ) : null}
    </>
  );
}

describe("useAccessibleDialog", () => {
  it("moves focus into the dialog, traps Tab, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Settings" })).toContainElement(document.activeElement as HTMLElement);
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });
});
