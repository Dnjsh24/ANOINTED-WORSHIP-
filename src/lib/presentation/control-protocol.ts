/**
 * The only commands a remote is allowed to ask the presentation executor to
 * perform.  Keeping this small and serialisable means Electron, the LAN
 * companion and Supabase Realtime all use the exact same contract.
 */
export const REMOTE_PROTOCOL_VERSION = 2 as const;

export type RemoteOutputMode = "slide" | "clear" | "black" | "logo";
export type RemoteDisplay = { id: string; label: string; width: number; height: number; primary: boolean };
export type RemoteStageFlashStyle = {
  fontSize: number;
  color: string;
  backgroundColor: string;
};
export type RemoteLiveSource =
  | { kind: "lineup"; setlistSongId?: string }
  | { kind: "presentation"; presentationId: string; presentationName: string }
  | { kind: "bible"; reference: string; translation: "kjv" | "web" | "bbe" };
export type RemotePresentationSummary = {
  id: string;
  name: string;
  slides: Array<{ id: string; label: string; preview: string }>;
};
export type RemoteContentLibrary = {
  version: 1;
  setlistId: string;
  capabilities: { presentations: boolean; bible: boolean };
  presentations: RemotePresentationSummary[];
  lyricShortcuts?: Array<{
    setlistSongId: string;
    bindings: Array<{ slideId: string; keyCode: string }>;
  }>;
  updatedAt: string;
};
export type RemoteCommandKind =
  | "select-song"
  | "select-slide"
  | "present-presentation-slide"
  | "present-bible-verse"
  | "set-lyric-shortcut"
  | "first-slide"
  | "previous-slide"
  | "next-slide"
  | "last-slide"
  | "present"
  | "clear"
  | "black"
  | "logo"
  | "present-projector"
  | "present-confidence"
  | "refresh-displays"
  | "claim-control"
  | "stage-message"
  | "timer";

export type RemoteCommand = {
  version: typeof REMOTE_PROTOCOL_VERSION;
  id: string;
  setlistId: string;
  kind: RemoteCommandKind;
  issuedAt: string;
  controllerId?: string;
  snapshotRevision?: number;
  payload?: {
    songIndex?: number;
    setlistSongId?: string;
    slideId?: string;
    presentationId?: string;
    reference?: string;
    translation?: "kjv" | "web" | "bbe";
    text?: string;
    keyCode?: string;
    message?: string;
    stageFlashStyle?: RemoteStageFlashStyle;
    timerAction?: "start" | "pause" | "reset";
    timerMinutes?: number;
    displayId?: string;
  };
};

export type RemoteLiveState = {
  version: typeof REMOTE_PROTOCOL_VERSION;
  setlistId: string;
  activeSongIndex: number;
  activeSlideId: string | null;
  snapshotRevision: number;
  outputMode: RemoteOutputMode;
  controllerReady: boolean;
  projectorOpen: boolean;
  projectorReady?: boolean;
  confidenceOpen: boolean;
  confidenceReady?: boolean;
  outputError?: string | null;
  projectorDisplayId?: string | null;
  confidenceDisplayId?: string | null;
  displays?: RemoteDisplay[];
  controller?: "remote" | "desktop" | null;
  activeSource?: RemoteLiveSource;
  lastAcknowledgement?: RemoteCommandAcknowledgement | null;
  updatedAt: string;
};

export type RemoteCommandAcknowledgement = {
  commandId: string;
  status: "applied" | "rejected";
  message: string;
  snapshotRevision?: number;
  updatedAt: string;
};

const commandKinds = new Set<RemoteCommandKind>([
  "select-song", "select-slide", "present-presentation-slide", "present-bible-verse", "set-lyric-shortcut", "first-slide", "previous-slide", "next-slide", "last-slide",
  "present", "clear", "black", "logo", "present-projector", "present-confidence", "refresh-displays", "claim-control", "stage-message", "timer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isValidPayload(kind: RemoteCommandKind, payload: unknown) {
  if (payload === undefined) return !["select-song", "select-slide", "present-presentation-slide", "present-bible-verse", "present-projector", "present-confidence", "stage-message"].includes(kind);
  if (!isRecord(payload)) return false;
  if (kind === "select-song") {
    return Number.isInteger(payload.songIndex)
      || (typeof payload.setlistSongId === "string" && payload.setlistSongId.length > 0 && payload.setlistSongId.length <= 160);
  }
  if (kind === "select-slide") return typeof payload.slideId === "string" && payload.slideId.length > 0 && payload.slideId.length <= 320;
  if (kind === "present-presentation-slide") {
    return typeof payload.presentationId === "string" && payload.presentationId.length > 0 && payload.presentationId.length <= 128
      && typeof payload.slideId === "string" && payload.slideId.length > 0 && payload.slideId.length <= 320;
  }
  if (kind === "present-bible-verse") {
    return typeof payload.reference === "string" && payload.reference.trim().length > 0 && payload.reference.length <= 120
      && typeof payload.text === "string" && payload.text.trim().length > 0 && payload.text.length <= 2_000
      && ["kjv", "web", "bbe"].includes(payload.translation as string);
  }
  if (kind === "set-lyric-shortcut") {
    return typeof payload.setlistSongId === "string" && payload.setlistSongId.length > 0 && payload.setlistSongId.length <= 160
      && typeof payload.slideId === "string" && payload.slideId.length > 0 && payload.slideId.length <= 320
      && (payload.keyCode === undefined || /^(?:Digit[0-9]|Key[A-Z])$/.test(String(payload.keyCode)));
  }
  if (kind === "present-projector" || kind === "present-confidence") return typeof payload.displayId === "string" && payload.displayId.length > 0 && payload.displayId.length <= 128;
  if (kind === "stage-message") {
    if (typeof payload.message !== "string" || payload.message.length > 10_000) return false;
    if (payload.stageFlashStyle === undefined) return true;
    return isRecord(payload.stageFlashStyle) && Number.isFinite(payload.stageFlashStyle.fontSize) && isHexColor(payload.stageFlashStyle.color) && isHexColor(payload.stageFlashStyle.backgroundColor);
  }
  if (kind === "timer") return ["start", "pause", "reset"].includes(payload.timerAction as string) && (payload.timerMinutes === undefined || (Number.isFinite(payload.timerMinutes) && Number(payload.timerMinutes) >= 1 && Number(payload.timerMinutes) <= 240));
  return Object.keys(payload).length === 0;
}

/** Runtime validation for untrusted LAN/cloud payloads. */
export function isRemoteCommand(value: unknown): value is RemoteCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<RemoteCommand>;
  return command.version === REMOTE_PROTOCOL_VERSION
    && typeof command.id === "string" && command.id.length >= 8 && command.id.length <= 128
    && typeof command.setlistId === "string" && command.setlistId.length > 0 && command.setlistId.length <= 128
    && typeof command.issuedAt === "string" && !Number.isNaN(Date.parse(command.issuedAt))
    && (command.snapshotRevision === undefined || (Number.isInteger(command.snapshotRevision) && command.snapshotRevision >= 0))
    && typeof command.kind === "string" && commandKinds.has(command.kind as RemoteCommandKind)
    && isValidPayload(command.kind as RemoteCommandKind, command.payload);
}

export function newRemoteCommand(setlistId: string, kind: RemoteCommandKind, payload?: RemoteCommand["payload"], controllerId?: string, snapshotRevision?: number): RemoteCommand {
  return {
    version: REMOTE_PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    setlistId,
    kind,
    issuedAt: new Date().toISOString(),
    controllerId,
    snapshotRevision,
    payload,
  };
}

export function isRemoteContentLibrary(value: unknown): value is RemoteContentLibrary {
  if (!isRecord(value)) return false;
  if (value.version !== 1
    || typeof value.setlistId !== "string" || value.setlistId.length === 0 || value.setlistId.length > 128
    || typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) return false;
  if (!isRecord(value.capabilities)
    || typeof value.capabilities.presentations !== "boolean"
    || typeof value.capabilities.bible !== "boolean"
    || !Array.isArray(value.presentations)
    || value.presentations.length > 100) return false;
  const presentationsValid = value.presentations.every((presentation) => isRecord(presentation)
    && typeof presentation.id === "string" && presentation.id.length > 0 && presentation.id.length <= 128
    && typeof presentation.name === "string" && presentation.name.length > 0 && presentation.name.length <= 120
    && Array.isArray(presentation.slides) && presentation.slides.length <= 500
    && presentation.slides.every((slide) => isRecord(slide)
      && typeof slide.id === "string" && slide.id.length > 0 && slide.id.length <= 320
      && typeof slide.label === "string" && slide.label.length > 0 && slide.label.length <= 120
      && typeof slide.preview === "string" && slide.preview.length <= 180));
  if (!presentationsValid) return false;
  if (value.lyricShortcuts === undefined) return true;
  return Array.isArray(value.lyricShortcuts)
    && value.lyricShortcuts.length <= 200
    && value.lyricShortcuts.every((song) => isRecord(song)
      && typeof song.setlistSongId === "string" && song.setlistSongId.length > 0 && song.setlistSongId.length <= 160
      && Array.isArray(song.bindings) && song.bindings.length <= 500
      && song.bindings.every((binding) => isRecord(binding)
        && typeof binding.slideId === "string" && binding.slideId.length > 0 && binding.slideId.length <= 320
        && typeof binding.keyCode === "string" && /^(?:Digit[0-9]|Key[A-Z])$/.test(binding.keyCode)));
}
