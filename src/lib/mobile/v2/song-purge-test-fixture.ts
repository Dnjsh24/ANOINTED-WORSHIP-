import { songTrashIdentity, songRestoreRequest, songTrashPage } from './song-trash-test-fixture';
import type { MobileSongPurgeRequest, MobileSongPurgeState, MobileSongPurgeReceipt } from './song-purge';
export const songPurgeIdentity = songTrashIdentity;
export const songPurgeRequest: MobileSongPurgeRequest = { ...songRestoreRequest, impact: { counts: { songs: 1, setlists: 1, setlistSlots: 2, favorites: 1, versions: 1, editRequests: 1, danceNotes: 1, annotations: 2, readinessResponses: 1, detachedPracticeFiles: 1, detachedLegacyRequests: 1 }, fingerprint: 'a'.repeat(64) } };
export const songPurgeState: MobileSongPurgeState = { version: 2, identity: songPurgeIdentity, memberCreatedAt: songPurgeRequest.memberCreatedAt, fetchedAt: songTrashPage.fetchedAt, songId: songPurgeRequest.base.id, status: 'ready', current: songTrashPage.items[0], impact: songPurgeRequest.impact };
export const songPurgeReceipt: MobileSongPurgeReceipt = { version: 2, request: songPurgeRequest, status: 'applied', current: null, recordedAt: songTrashPage.fetchedAt };

