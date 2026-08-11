import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArrangementEditor } from "@/components/arrangement-editor";

describe("ArrangementEditor", () => {
  it("lets the user add and edit an Ending before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ArrangementEditor
        onClose={vi.fn()}
        onSave={onSave}
        songTitle="Let Us Shout"
        initialArrangement="Verse 1"
        lyrics={`[Verse 1]\nC\nIn the name of Jesus`}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Ending" }));
    expect(screen.getByRole("textbox", { name: "Section name" })).toHaveValue("Ending");

    await user.type(
      screen.getByRole("textbox", { name: "Chords and lyrics" }),
      "G  C{enter}You reign forever",
    );
    await user.click(screen.getByRole("button", { name: "Save Arrangement" }));

    expect(onSave).toHaveBeenCalledWith(
      "Verse 1, Ending",
      expect.arrayContaining([
        expect.objectContaining({
          label: "Ending",
          content: "G  C\nYou reign forever",
        }),
      ]),
    );
  });

  it("keeps edits on repeated sections independent", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ArrangementEditor
        onClose={vi.fn()}
        onSave={onSave}
        songTitle="Repeated Chorus"
        initialArrangement="Chorus, Chorus"
        initialSections={[
          { id: "chorus-1", label: "Chorus", content: "C\nFirst chorus" },
          { id: "chorus-2", label: "Chorus", content: "F\nFinal chorus" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit Chorus 2" }));
    const editor = screen.getByRole("textbox", { name: "Chords and lyrics" });
    await user.clear(editor);
    await user.type(editor, "G\nEdited final chorus");
    await user.click(screen.getByRole("button", { name: "Save Arrangement" }));

    const savedSections = onSave.mock.calls[0]?.[1];
    expect(savedSections).toEqual([
      { id: "chorus-1", label: "Chorus", content: "C\nFirst chorus" },
      { id: "chorus-2", label: "Chorus", content: "G\nEdited final chorus" },
    ]);
  });
});
