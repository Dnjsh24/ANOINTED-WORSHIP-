/** Desktop-only runtime helpers. Never expose the data directory to client code. */
export function isDesktopRuntime() {
  return process.env.ANW_DESKTOP_MODE === "1";
}

export function getDesktopDataDirectory() {
  if (!isDesktopRuntime()) {
    throw new Error("The local worship workspace is only available in the Windows app.");
  }

  const directory = process.env.ANW_DESKTOP_DATA_DIR;
  if (!directory) {
    throw new Error("The Windows app did not provide its local data directory.");
  }

  return directory;
}
