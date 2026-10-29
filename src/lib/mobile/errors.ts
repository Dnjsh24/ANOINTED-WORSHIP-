/** Shared wire error; hosted routes and authenticated native readers preserve the same denial codes. */
export class MobileApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'MobileApiError'; }
}
