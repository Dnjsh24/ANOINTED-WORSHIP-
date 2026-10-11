export const woolyDialogSurfaces = ["announcement", "reminder", "save-template", "template-picker", "band-notes", "arrangement", "member", "event-delete", "song-delete"] as const;

export function findWoolyDialogSurface(dialog: HTMLElement, expected: readonly string[]): HTMLElement | null {
  const surface = dialog.dataset.woolySurface;
  return surface && woolyDialogSurfaces.some((id) => id === surface) && expected.includes(surface) ? dialog : null;
}
