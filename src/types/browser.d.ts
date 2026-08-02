export {};

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>;
  }

  interface Navigator {
    standalone?: boolean;
  }

  interface Window {
    __onlineUsers?: string[];
    webkitAudioContext?: typeof AudioContext;
  }
}
