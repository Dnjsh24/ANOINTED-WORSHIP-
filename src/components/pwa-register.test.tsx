import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaRegister } from "./pwa-register";

const P256_PUBLIC_KEY_HEX =
  "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296" +
  "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5";
const PENDING_PUSH_SAVE_SESSION_KEY = "anointed-worship:pending-push-save";
const P256_PUBLIC_KEY_BYTES = Uint8Array.from(
  P256_PUBLIC_KEY_HEX.match(/.{2}/g) ?? [],
  (bytePair) => Number.parseInt(bytePair, 16),
);
const VAPID_PUBLIC_KEY = btoa(String.fromCharCode(...P256_PUBLIC_KEY_BYTES))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function createPushSubscription(applicationServerKey: ArrayBuffer | null = null) {
  const serializedSubscription = {
    endpoint: "https://push.example/subscription",
    expirationTime: null,
    keys: {
      p256dh: "p".repeat(64),
      auth: "a".repeat(24),
    },
  };

  return {
    endpoint: serializedSubscription.endpoint,
    expirationTime: null,
    options: { applicationServerKey },
    toJSON: () => serializedSubscription,
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription;
}

function createDeferred<Value>() {
  let resolvePromise: (value: Value | PromiseLike<Value>) => void = () => undefined;
  let rejectPromise: (error?: unknown) => void = () => undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function createBrowserMocks() {
  let permission: NotificationPermission = "default";
  const setPermission = (nextPermission: NotificationPermission) => {
    permission = nextPermission;
  };
  const requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => {
    permission = "granted";
    return permission;
  });

  vi.stubGlobal("Notification", {
    get permission() {
      return permission;
    },
    requestPermission,
  });
  vi.stubGlobal("PushManager", {});

  const newSubscription = createPushSubscription(copyToArrayBuffer(P256_PUBLIC_KEY_BYTES));
  const getSubscription = vi.fn<() => Promise<PushSubscription | null>>().mockResolvedValue(null);
  const subscribe = vi.fn<
    (options: PushSubscriptionOptionsInit) => Promise<PushSubscription>
  >().mockResolvedValue(newSubscription);
  const registration = {
    scope: "https://worship.example/",
    waiting: null,
    addEventListener: vi.fn(),
    pushManager: { getSubscription, subscribe },
  } as unknown as ServiceWorkerRegistration;
  const serviceWorker = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker,
  });

  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  return {
    fetch,
    getSubscription,
    newSubscription,
    registration,
    requestPermission,
    serviceWorker,
    setPermission,
    subscribe,
  };
}

let originalServiceWorkerDescriptor: PropertyDescriptor | undefined;
let browserMocks: ReturnType<typeof createBrowserMocks>;

beforeEach(() => {
  originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  window.sessionStorage.removeItem(PENDING_PUSH_SAVE_SESSION_KEY);
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VAPID_PUBLIC_KEY);
  vi.stubGlobal("isSecureContext", true);
  browserMocks = createBrowserMocks();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.sessionStorage.removeItem(PENDING_PUSH_SAVE_SESSION_KEY);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (originalServiceWorkerDescriptor) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});

async function renderNotificationPrompt(permission: NotificationPermission = "default") {
  browserMocks.setPermission(permission);
  render(<PwaRegister />);

  return screen.findByRole("button", { name: "Enable" });
}

describe("PwaRegister push notification setup", () => {
  it("keeps the HTTPS requirement before requesting permission", async () => {
    vi.stubGlobal("isSecureContext", false);
    const enableButton = await renderNotificationPrompt();
    fireEvent.click(enableButton);
    expect(await screen.findByRole("alert")).toHaveTextContent("secure HTTPS connection or localhost");
    expect(browserMocks.requestPermission).not.toHaveBeenCalled();
    expect(browserMocks.subscribe).not.toHaveBeenCalled();
    expect(browserMocks.fetch).not.toHaveBeenCalled();
  });

  it("waits for an active service worker before checking or creating a subscription", async () => {
    const serviceWorkerReady = createDeferred<ServiceWorkerRegistration>();
    browserMocks.serviceWorker.ready = serviceWorkerReady.promise;
    const enableButton = await renderNotificationPrompt("granted");

    fireEvent.click(enableButton);

    expect(await screen.findByRole("button", { name: "Enabling..." })).toBeDisabled();
    expect(browserMocks.getSubscription).toHaveBeenCalledTimes(1);
    expect(browserMocks.subscribe).not.toHaveBeenCalled();

    serviceWorkerReady.resolve(browserMocks.registration);

    await waitFor(() => expect(browserMocks.fetch).toHaveBeenCalledTimes(1));
    expect(browserMocks.getSubscription).toHaveBeenCalledTimes(2);
    expect(browserMocks.subscribe).toHaveBeenCalledTimes(1);
    expect(browserMocks.requestPermission).not.toHaveBeenCalled();
  });

  it("reports a bounded service-worker readiness timeout and re-enables controls", async () => {
    const serviceWorkerReady = createDeferred<ServiceWorkerRegistration>();
    browserMocks.serviceWorker.ready = serviceWorkerReady.promise;
    const enableButton = await renderNotificationPrompt("granted");

    vi.useFakeTimers();
    try {
      fireEvent.click(enableButton);

      expect(screen.getByRole("button", { name: "Enabling..." })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(screen.getByRole("alert")).toHaveTextContent(
        "The service worker is not ready yet. Refresh the page and try again.",
      );
      expect(screen.getByRole("button", { name: "Enable" })).toBeEnabled();
      expect(browserMocks.subscribe).not.toHaveBeenCalled();
      expect(browserMocks.fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not prompt again for an already saved matching subscription after reload", async () => {
    browserMocks.setPermission("granted");
    browserMocks.getSubscription.mockResolvedValue(
      createPushSubscription(copyToArrayBuffer(P256_PUBLIC_KEY_BYTES)),
    );

    render(<PwaRegister />);

    await waitFor(() => expect(browserMocks.getSubscription).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Enable ministry notifications?")).not.toBeInTheDocument();
    expect(browserMocks.requestPermission).not.toHaveBeenCalled();
  });

  it("replaces a subscription only when its application server key changed", async () => {
    const previousKey = new Uint8Array(P256_PUBLIC_KEY_BYTES);
    previousKey[previousKey.length - 1] ^= 1;
    const previousSubscription = createPushSubscription(copyToArrayBuffer(previousKey));
    browserMocks.getSubscription.mockResolvedValue(previousSubscription);

    const enableButton = await renderNotificationPrompt("granted");
    fireEvent.click(enableButton);

    await waitFor(() => expect(browserMocks.fetch).toHaveBeenCalledTimes(1));

    expect(previousSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(browserMocks.subscribe).toHaveBeenCalledTimes(1);
    expect(browserMocks.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(ArrayBuffer),
    });
  });

  it("keeps a push service failure retryable after reload when permission is already granted", async () => {
    browserMocks.setPermission("granted");
    browserMocks.subscribe
      .mockRejectedValueOnce(new DOMException("Registration failed - push service error", "AbortError"))
      .mockResolvedValueOnce(browserMocks.newSubscription);

    const enableButton = await renderNotificationPrompt("granted");
    fireEvent.click(enableButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The browser could not register this device with its push service. Check your connection and try again.",
    );
    expect(browserMocks.fetch).not.toHaveBeenCalled();

    cleanup();
    const retryButton = await renderNotificationPrompt("granted");
    fireEvent.click(retryButton);

    await waitFor(() => expect(browserMocks.fetch).toHaveBeenCalledTimes(1));
    expect(browserMocks.requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByText("Enable ministry notifications?")).not.toBeInTheDocument();
  });

  it("keeps a failed save retryable after reload and reuses its matching subscription", async () => {
    browserMocks.setPermission("granted");
    browserMocks.getSubscription
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(browserMocks.newSubscription);
    browserMocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const enableButton = await renderNotificationPrompt("granted");
    fireEvent.click(enableButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server could not save this notification subscription. Try again.",
    );
    expect(screen.getByText("Enable ministry notifications?")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(PENDING_PUSH_SAVE_SESSION_KEY)).toBe("true");

    cleanup();
    const retryButton = await renderNotificationPrompt("granted");
    fireEvent.click(retryButton);

    await waitFor(() => expect(browserMocks.fetch).toHaveBeenCalledTimes(2));
    expect(browserMocks.subscribe).toHaveBeenCalledTimes(1);
    expect(browserMocks.newSubscription.unsubscribe).not.toHaveBeenCalled();
    expect(browserMocks.requestPermission).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_PUSH_SAVE_SESSION_KEY)).toBeNull();
    expect(screen.queryByText("Enable ministry notifications?")).not.toBeInTheDocument();
  });

  it("ignores duplicate enable clicks while the permission request is pending", async () => {
    const pendingPermission = createDeferred<NotificationPermission>();
    browserMocks.requestPermission.mockImplementation(async () => {
      const nextPermission = await pendingPermission.promise;
      browserMocks.setPermission(nextPermission);
      return nextPermission;
    });

    const enableButton = await renderNotificationPrompt();
    fireEvent.click(enableButton);
    fireEvent.click(enableButton);

    expect(browserMocks.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Enabling..." })).toBeDisabled();

    pendingPermission.resolve("granted");

    await waitFor(() => expect(browserMocks.fetch).toHaveBeenCalledTimes(1));
  });

  it.each([
    { label: "missing", key: "" },
    { label: "invalid", key: "not-a-vapid-public-key" },
  ])("does not prompt with a $label VAPID key", async ({ key }) => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", key);

    render(<PwaRegister />);

    await waitFor(() => expect(browserMocks.serviceWorker.register).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Enable ministry notifications?")).not.toBeInTheDocument();
    expect(browserMocks.requestPermission).not.toHaveBeenCalled();
    expect(browserMocks.subscribe).not.toHaveBeenCalled();
    expect(browserMocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps the prompt open when the user denies notification permission", async () => {
    browserMocks.requestPermission.mockImplementation(async () => {
      browserMocks.setPermission("denied");
      return "denied";
    });

    const enableButton = await renderNotificationPrompt();
    fireEvent.click(enableButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notifications are blocked. Allow them in your browser settings, then try again.",
    );
    expect(screen.getByText("Enable ministry notifications?")).toBeInTheDocument();
    expect(browserMocks.subscribe).not.toHaveBeenCalled();
    expect(browserMocks.fetch).not.toHaveBeenCalled();
  });

  it("reports a thrown permission request and re-enables controls", async () => {
    browserMocks.requestPermission.mockRejectedValueOnce(
      new DOMException("Permission request failed", "NotAllowedError"),
    );

    const enableButton = await renderNotificationPrompt();
    fireEvent.click(enableButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Permission request failed");
    expect(screen.getByRole("button", { name: "Enable" })).toBeEnabled();
    expect(browserMocks.subscribe).not.toHaveBeenCalled();
    expect(browserMocks.fetch).not.toHaveBeenCalled();
  });
});