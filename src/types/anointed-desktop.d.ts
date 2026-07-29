export {};

declare global {
  interface Window {
    anointedDesktop?: {
      isDesktop: boolean;
      listDisplays(): Promise<Array<{ id: string; label: string; width: number; height: number; primary: boolean }>>;
      listCaptureSources(): Promise<Array<{ id: string; name: string; thumbnail?: string }>>;
      openProjector(setlistId: string, displayId?: string): Promise<{ usedFallback?: boolean; savedDisplayId?: string; opened: boolean; ready?: boolean; error?: string }>;
      openConfidence(setlistId: string, displayId?: string): Promise<{ usedFallback?: boolean; savedDisplayId?: string; opened: boolean; ready?: boolean; error?: string }>;
      openLogicalOutput(outputId: string, route: "projector" | "confidence", setlistId: string, displayId?: string, lookName?: string, lookLayout?: string): Promise<{ usedFallback?: boolean; savedDisplayId?: string; opened: boolean }>;
      markOutputReady(kind: "projector" | "confidence"): Promise<boolean>;
      getOutputStatus(): Promise<{ projectorOpen: boolean; projectorReady: boolean; confidenceOpen: boolean; confidenceReady: boolean; outputError: string | null; projectorDisplayId: string | null; confidenceDisplayId: string | null; logicalOutputs: Array<{ id: string; open: boolean; displayId: string | null }> }>;
      importBackgrounds(): Promise<{ imports: Array<{ id: string; storageName: string; displayName: string; mediaType: "image" | "video"; contentType: string; sizeBytes: number }>; collectionName?: string }>;
      importBackgroundFolder(): Promise<{ imports: Array<{ id: string; storageName: string; displayName: string; mediaType: "image" | "video"; contentType: string; sizeBytes: number }>; collectionName?: string }>;
      openRemote(setlistId: string): Promise<{ opened: boolean }>;
      startLanRemote(setlistId: string): Promise<{ active: boolean; url?: string; qrDataUrl?: string }>;
      createQrCode(url: string): Promise<string>;
      stopLanRemote(): Promise<{ active: boolean }>;
      publishLanRemoteState(state: unknown): void;
      onLanRemoteCommand(callback: (command: unknown) => void): () => void;
      onDisplaysChanged(callback: (displays: Array<{ id: string; label: string; width: number; height: number; primary: boolean }>) => void): () => void;
    };
  }
}
