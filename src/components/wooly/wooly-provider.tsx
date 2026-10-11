"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Bug, RotateCcw, Search, X } from "lucide-react";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { WoolyMascot } from "./wooly-mascot";
import { WoolyInstructions } from "./wooly-instructions";
import { WoolyTargetPointer } from "./wooly-target-pointer";
import { trackWoolyTarget } from "./wooly-target";
import { useWoolyChat } from "./use-wooly-chat";
import { useWoolyQuestions } from "./use-wooly-questions";
import { useWoolyGreeting } from "./use-wooly-greeting";
import { WoolyHelpViews } from "./wooly-help-views";
import { WoolyTaskList } from "./wooly-task-list";
import { findWoolyDialogSurface } from "@/lib/domain/wooly-surfaces";
import { readTutorialProgressAction, saveTutorialProgressAction } from "@/app/wooly-actions";
import { canUseWoolyTour, bindWoolyGuideRoute, getWoolyGuide, getWoolyHelpTopics, getWoolyPageGuideId, getWoolyTourSteps, woolyTours, WOOLY_TOUR_VERSION, type TutorialCheckpoint, type TutorialProgress, type TutorialStatus, type WoolyAudience, type WoolyHelpTopic, type WoolyTourId } from "@/lib/domain/wooly";
import "./wooly.css";
import "./wooly-chat.css";

type QuickReportHandler = (restoreFocus: () => void) => void;

type WoolyContextValue = {
  register: (audience: WoolyAudience, owner: object) => void;
  unregister: (owner: object) => void;
  refresh: () => Promise<void>;
  registerQuickReport: (handler: QuickReportHandler) => () => void;
};

type TourSession = { tourId: WoolyTourId; stepIndex: number; stepId: string; routeContext: string; status: "in_progress" | "paused"; persist: boolean };
type Panel = "closed" | "help" | "welcome" | "tour";
type WoolyScreenProps = { audience: WoolyAudience };

const WoolyContext = createContext<WoolyContextValue | null>(null);
const tourIds: readonly WoolyTourId[] = ["joining", "creating", "essentials"];
const allowedRoutes = { has: (route: string) => getWoolyPageGuideId(route) !== null };
const subscribeToMount = () => () => undefined;
const getClientMounted = () => true;
const getServerMounted = () => false;
const checkpointLabels: Record<TutorialStatus, string> = { offered: "welcome invitation", in_progress: "tutorial step", paused: "paused tutorial", skipped: "skipped tutorial", completed: "completed tutorial" };
function tourHref(route: string) {
  return ["page-projector", "page-confidence", "page-remote-session"].includes(getWoolyPageGuideId(route) ?? "") ? `${route}?wooly=1` : route;
}
function stepAtLocation(route: string, pathname: string | null, search: string) {
  const [path, query] = route.split("?");
  if (path !== pathname) return false;
  const current = new URLSearchParams(search);
  return !query || [...new URLSearchParams(query)].every(([key, value]) => current.get(key) === value);
}
function restoreTutorialFocus(surface: HTMLElement | null, fallback: HTMLElement | null) {
  window.setTimeout(() => {
    if (!surface?.isConnected) { fallback?.focus(); return; }
    // Removing the compact guide must leave focus inside the still-open form.
    const control = [...surface.querySelectorAll<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex="0"]')]
      .find((element) => !element.closest(".wooly-inline-guide, [hidden], [inert]"));
    (control ?? surface).focus();
  }, 0);
}

/** Keep the existing report form mounted while Wooly hands over its dialog. */
export function useWoolyReportRegistration() {
  return useContext(WoolyContext)?.registerQuickReport ?? null;
}

export function WoolyProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationSearch = searchParams.toString();
  const router = useRouter();
  const [audience, setAudience] = useState<WoolyAudience | null>(null);
  const [progress, setProgress] = useState<Partial<Record<WoolyTourId, TutorialProgress>>>({});
  const [checkpoints, setCheckpoints] = useState<Partial<Record<WoolyTourId, TourSession>>>({});
  const [failedCheckpoints, setFailedCheckpoints] = useState<Partial<Record<WoolyTourId, TutorialCheckpoint>>>({});
  const [panel, setPanel] = useState<Panel>("closed");
  const [activeTour, setActiveTour] = useState<TourSession | null>(null);
  const [helpQuery, setHelpQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<WoolyHelpTopic | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [screenGeneration, setScreenGeneration] = useState(0);
  const mounted = useSyncExternalStore(subscribeToMount, getClientMounted, getServerMounted);
  const greetingVisible = useWoolyGreeting(enabled);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [dialogSurface, setDialogSurface] = useState<HTMLElement | null>(null);
  const [recordTask, setRecordTask] = useState<WoolyTourId | null>(null);
  const [openQuickReport, setOpenQuickReport] = useState<QuickReportHandler | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const requestId = useRef(0);
  const expectedRoute = useRef<string | null>(null);
  const currentPath = useRef(pathname);
  const registration = useRef<{ audience: WoolyAudience; owner: object; pathname: string } | null>(null);
  const pendingSaves = useRef(new Map<string, Promise<boolean>>());
  const latestCheckpoint = useRef(new Map<string, TutorialCheckpoint>());
  const offered = useRef<Set<string>>(new Set());
  const interactionVersion = useRef(0);

  const registerQuickReport = useCallback((handler: QuickReportHandler) => {
    setOpenQuickReport(() => handler);
    return () => setOpenQuickReport((current: QuickReportHandler | null) => current === handler ? null : current);
  }, []);

  const clearRegistration = useCallback(() => {
    requestId.current += 1;
    registration.current = null;
    expectedRoute.current = null;
    latestCheckpoint.current.clear();
    offered.current = new Set();
    interactionVersion.current += 1;
    setAudience(null);
    setProgress({});
    setLoadedUserId(null);
    setCheckpoints({});
    setFailedCheckpoints({});
    setActiveTour(null);
    setPanel("closed");
    setSelectedTopic(null);
    setRecordTask(null);
    setHelpQuery("");
    setTargetRect(null);
  }, []);

  const sessionChanged = useCallback(() => { clearRegistration(); router.refresh?.(); }, [clearRegistration, router]);
  const chat = useWoolyChat(audience, pathname ?? "/", sessionChanged);
  const questions = useWoolyQuestions(audience, panel === "help", pathname ?? "/", chat.view === "questions", sessionChanged);

  useEffect(() => {
    if (!pathname || !allowedRoutes.has(pathname)) queueMicrotask(clearRegistration);
  }, [pathname, clearRegistration]);

  useLayoutEffect(() => {
    currentPath.current = pathname;
  }, [pathname]);

  const register = useCallback((nextAudience: WoolyAudience, owner: object) => {
    const route = currentPath.current;
    if (!enabled || !route || !allowedRoutes.has(route) || !nextAudience.userId.trim()) {
      clearRegistration();
      return;
    }
    if (registration.current?.audience.userId !== nextAudience.userId) {
      requestId.current += 1;
      setProgress({});
      setLoadedUserId(null);
      setCheckpoints({});
      setFailedCheckpoints({});
      setActiveTour(null);
      setPanel("closed");
      offered.current = new Set();
      interactionVersion.current += 1;
    }
    if (expectedRoute.current === route) expectedRoute.current = null;
    registration.current = { audience: nextAudience, owner, pathname: route };
    setScreenGeneration((current) => current + 1);
    setAudience((current) => current?.userId === nextAudience.userId && current?.teamId === nextAudience.teamId && current?.hasTeam === nextAudience.hasTeam && current?.canManageMembers === nextAudience.canManageMembers && current?.session === nextAudience.session && current?.role === nextAudience.role && current?.permissions?.join() === nextAudience.permissions?.join() ? current : nextAudience);
  }, [clearRegistration, enabled]);

  const unregister = useCallback((owner: object) => {
    if (registration.current?.owner !== owner) return;
    const routeChanged = registration.current.pathname !== currentPath.current;
    const currentRouteIsEligible = Boolean(currentPath.current && allowedRoutes.has(currentPath.current));
    const expectedRouteIsEligible = expectedRoute.current !== null && allowedRoutes.has(expectedRoute.current);
    const eligibleHandoff = currentRouteIsEligible && (expectedRouteIsEligible || routeChanged);
    if (eligibleHandoff) return;
    clearRegistration();
  }, [clearRegistration]);

  const refresh = useCallback(async () => {
    const current = registration.current?.audience;
    if (!enabled || !current) return;
    if (current.session === "guest" || current.session === "demo") {
      setLoadedUserId(current.userId);
      return;
    }
    const request = ++requestId.current;
    try {
      const result = await readTutorialProgressAction();
      if (request !== requestId.current || registration.current?.audience.userId !== current.userId) return;
      if (result.ok) {
        setProgress(Object.fromEntries(result.progress.map((item) => [item.tourId, item])));
        setLoadedUserId(current.userId);
      }
    } catch {
      if (request === requestId.current) setLoadedUserId(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !audience?.userId) {
      requestId.current += 1;
      return;
    }
    void Promise.resolve().then(refresh);
  }, [audience?.userId, enabled, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const enqueueCheckpoint = useCallback((userId: string, checkpoint: TutorialCheckpoint) => {
    const key = `${userId}:${checkpoint.tourId}`;
    latestCheckpoint.current.set(key, checkpoint);
    const previous = pendingSaves.current.get(key) ?? Promise.resolve(true);
    const task = previous.catch(() => false).then(async () => {
      if (registration.current?.audience.userId !== userId || registration.current.audience.session === "guest" || registration.current.audience.session === "demo") return false;
      let result: Awaited<ReturnType<typeof saveTutorialProgressAction>>;
      try {
        result = await saveTutorialProgressAction(checkpoint);
      } catch {
        result = { ok: false, message: "Wooly progress could not sync." };
      }
      if (registration.current?.audience.userId !== userId) return false;
      if (!result.ok) {
        if (latestCheckpoint.current.get(key) === checkpoint) setFailedCheckpoints((current) => ({ ...current, [checkpoint.tourId]: checkpoint }));
        return false;
      }
      requestId.current += 1;
      setProgress((current) => ({ ...current, [result.progress.tourId]: result.progress }));
      if (latestCheckpoint.current.get(key) === checkpoint) {
        setFailedCheckpoints((current) => ({ ...current, [checkpoint.tourId]: undefined }));
        latestCheckpoint.current.delete(key);
      }
      return true;
    });
    pendingSaves.current.set(key, task);
    void task.finally(() => {
      if (pendingSaves.current.get(key) === task) pendingSaves.current.delete(key);
    });
    return task;
  }, []);

  const saveOffered = useCallback(async (tourId: WoolyTourId) => {
    if (progress[tourId] || offered.current.has(tourId)) return;
    offered.current.add(tourId);
    const firstStep = woolyTours[tourId].steps[0];
    const userId = registration.current?.audience.userId;
    if (!userId) return;
    await enqueueCheckpoint(userId, { tourId, version: WOOLY_TOUR_VERSION, status: "offered", nextStep: firstStep.id });
  }, [progress, enqueueCheckpoint]);

  useEffect(() => {
    if (!enabled || !audience || audience.session === "guest" || !pathname || !allowedRoutes.has(pathname)) return;
    const welcomeTour = pathname === "/teams" || pathname === "/teams/join" ? "joining" : pathname === "/teams/new" ? "creating" : pathname === "/dashboard" ? "essentials" : null;
    if (!welcomeTour || loadedUserId !== audience.userId || !canUseWoolyTour(welcomeTour, audience) || offered.current.has(welcomeTour)) return;
    if (progress[welcomeTour]) return;
    const offerVersion = interactionVersion.current;
    void saveOffered(welcomeTour).then(() => {
      const currentAudience = registration.current?.audience;
      const registeredPath = registration.current?.pathname;
      const stillOnWelcomeRoute = welcomeTour === "joining"
        ? registeredPath === "/teams" || registeredPath === "/teams/join"
        : welcomeTour === "creating" ? registeredPath === "/teams/new" : registeredPath === "/dashboard";
      const hasOtherDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((element) => !element.classList.contains("wooly-panel"));
      if (offerVersion === interactionVersion.current && currentAudience?.userId === audience.userId && canUseWoolyTour(welcomeTour, currentAudience) && stillOnWelcomeRoute && !hasOtherDialog) setPanel("welcome");
    });
  }, [audience, enabled, loadedUserId, pathname, progress, saveOffered]);

  const persistSession = useCallback(async (session: TourSession, status: TutorialStatus) => {
    if (!session.persist) return;
    const userId = registration.current?.audience.userId;
    if (!userId) return;
    const checkpoint: TutorialCheckpoint = { tourId: session.tourId, version: WOOLY_TOUR_VERSION, status, nextStep: session.stepId };
    await enqueueCheckpoint(userId, checkpoint);
  }, [enqueueCheckpoint]);

  const beginTour = useCallback((tourId: WoolyTourId, stepId?: string) => {
    if (!audience || !canUseWoolyTour(tourId, audience)) return;
    interactionVersion.current += 1;
    const pageGuide = getWoolyGuide(tourId);
    const routeContext = pageGuide ? bindWoolyGuideRoute(pageGuide.route, pathname ?? "") ?? "" : pathname ?? "";
    const steps = getWoolyTourSteps(tourId, routeContext, audience);
    if (!steps.length) {
      if (activeTour) {
        const paused = { ...activeTour, status: "paused" as const };
        setCheckpoints((current) => ({ ...current, [paused.tourId]: paused }));
        void persistSession(paused, "paused");
        setActiveTour(null);
      }
      setRecordTask(tourId); setPanel("help"); return;
    }
    setRecordTask(null);
    const stepIndex = stepId ? Math.max(0, steps.findIndex((step) => step.id === stepId)) : 0;
    const previous = progress[tourId];
    if (activeTour) {
      const paused = { ...activeTour, status: "paused" as const };
      setCheckpoints((current) => ({ ...current, [paused.tourId]: paused }));
      void persistSession(paused, "paused");
    }
    focusReturn.current = launcherRef.current;
    const session: TourSession = { tourId, stepIndex, stepId: steps[stepIndex].id, routeContext, status: "in_progress", persist: audience.session !== "guest" && audience.session !== "demo" && (!previous || !["completed", "skipped"].includes(previous.status)) };
    setActiveTour(session);
    setPanel("tour");
    void persistSession(session, "in_progress");
    const route = steps[stepIndex].route;
    if (!stepAtLocation(route, pathname, locationSearch)) { expectedRoute.current = route; router.push(tourHref(route)); }
  }, [activeTour, audience, pathname, locationSearch, persistSession, progress, router]);

  const closeTour = useCallback((restoreFocus = true) => {
    if (!activeTour) return;
    interactionVersion.current += 1;
    const paused = { ...activeTour, status: "paused" as const };
    setCheckpoints((current) => ({ ...current, [paused.tourId]: paused }));
    void persistSession(paused, "paused");
    setActiveTour(null);
    setPanel("closed");
    if (restoreFocus) restoreTutorialFocus(dialogSurface, focusReturn.current);
  }, [activeTour, persistSession, dialogSurface]);

  const moveStep = useCallback((direction: -1 | 1) => {
    if (!activeTour || !audience) return;
    const steps = getWoolyTourSteps(activeTour.tourId, activeTour.routeContext, audience);
    const currentIndex = steps.findIndex((step) => step.id === activeTour.stepId);
    if (currentIndex < 0) return;
    const stepIndex = currentIndex + direction;
    if (stepIndex < 0) return;
    if (stepIndex >= steps.length) {
      const completed = { ...activeTour, stepIndex: steps.length - 1 };
      setActiveTour(null);
      setPanel("closed");
      void persistSession(completed, "completed");
      setCheckpoints((current) => ({ ...current, [completed.tourId]: undefined }));
      restoreTutorialFocus(dialogSurface, focusReturn.current);
      return;
    }
    const next = { ...activeTour, stepIndex, stepId: steps[stepIndex].id };
    setActiveTour(next);
    void persistSession(next, "in_progress");
    const route = steps[stepIndex].route;
    if (!stepAtLocation(route, pathname, locationSearch)) { expectedRoute.current = route; router.push(tourHref(route)); }
  }, [activeTour, audience, pathname, locationSearch, persistSession, router, dialogSurface]);

  const skipTour = useCallback(() => {
    if (!activeTour) return;
    interactionVersion.current += 1;
    const skipped = { ...activeTour, stepIndex: Math.min(activeTour.stepIndex, woolyTours[activeTour.tourId].steps.length - 1) };
    setActiveTour(null);
    setPanel("closed");
    setCheckpoints((current) => ({ ...current, [skipped.tourId]: undefined }));
    void persistSession(skipped, "skipped");
    restoreTutorialFocus(dialogSurface, focusReturn.current);
  }, [activeTour, persistSession, dialogSurface]);

  const retryCheckpoint = useCallback((tourId: WoolyTourId) => {
    const checkpoint = failedCheckpoints[tourId];
    const userId = registration.current?.audience.userId;
    if (checkpoint && userId) void enqueueCheckpoint(userId, checkpoint);
  }, [enqueueCheckpoint, failedCheckpoints]);

  const activeSteps = useMemo(() => activeTour && audience ? getWoolyTourSteps(activeTour.tourId, activeTour.routeContext, audience) : [], [activeTour, audience]);
  const currentStepIndex = activeSteps.findIndex((step) => step.id === activeTour?.stepId);
  const currentStep = activeSteps[currentStepIndex] ?? null;
  useEffect(() => {
    if (!dialogSurface || !currentStep) return;
    const selector = `[data-wooly-target="${currentStep.target}"]`;
    const target = dialogSurface.matches(selector) ? dialogSurface : dialogSurface.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.setAttribute("data-wooly-highlight", "true");
    return () => { target.removeAttribute("data-wooly-highlight"); };
  }, [dialogSurface, currentStep]);
  const panelIsModal = panel === "help" || panel === "welcome";
  const panelRef = useAccessibleDialog({ open: mounted && panelIsModal, onClose: () => setPanel("closed") });
  const visibleSelectedTopic = selectedTopic && audience && getWoolyHelpTopics(audience).some((topic) => topic.id === selectedTopic.id) ? selectedTopic : null;
  useEffect(() => {
    if (selectedTopic && !visibleSelectedTopic) void Promise.resolve().then(() => setSelectedTopic(null));
  }, [selectedTopic, visibleSelectedTopic]);
  const showSelectedTopicTour = () => {
    if (!visibleSelectedTopic?.tourId || !audience || !getWoolyHelpTopics(audience).some((topic) => topic.id === visibleSelectedTopic.id)) return;
    beginTour(visibleSelectedTopic.tourId, visibleSelectedTopic.stepId ?? undefined);
  };

  useEffect(() => {
    if (!activeTour || !audience || (canUseWoolyTour(activeTour.tourId, audience) && currentStep)) return;
    const paused = { ...activeTour, status: "paused" as const };
    void Promise.resolve().then(() => {
      setCheckpoints((current) => ({ ...current, [paused.tourId]: paused }));
      setActiveTour(null);
      setPanel("closed");
      return persistSession(paused, "paused");
    });
  }, [activeTour, audience, currentStep, persistSession]);

  useEffect(() => {
    if (panel === "closed") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dialogSurface) { closeTour(false); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (panel === "tour") closeTour();
        else setPanel("closed");
      } else if ([" ", "ArrowRight", "ArrowLeft", "PageDown", "PageUp"].includes(event.key) || /^[a-z0-9]$/i.test(event.key)) {
        // Do not let presentation shortcuts run while someone is reading Wooly.
        // A typing input or button still receives its normal local keyboard event.
        if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (!(event.target instanceof Element) || !event.target.closest(".wooly-panel, .wooly-inline-guide")) event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeTour, panel, dialogSurface]);

  useEffect(() => {
    const update = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((element) => !element.classList.contains("wooly-panel"));
      const expected = activeTour && audience ? getWoolyTourSteps(activeTour.tourId, activeTour.routeContext, audience).flatMap((step) => step.surface ? [step.surface] : []) : [];
      const supported = dialogs.length === 1 ? findWoolyDialogSurface(dialogs[0], expected) : null;
      setDialogSurface(supported);
      if (supported && activeTour && audience) {
        const steps = getWoolyTourSteps(activeTour.tourId, activeTour.routeContext, audience);
        const firstInside = steps.findIndex((step) => step.surface === supported.dataset.woolySurface);
        const currentIndex = steps.findIndex((step) => step.id === activeTour.stepId);
        if (firstInside > currentIndex) {
          const next = { ...activeTour, stepIndex: firstInside, stepId: steps[firstInside].id };
          queueMicrotask(() => { setActiveTour(next); void persistSession(next, "in_progress"); });
        }
      }
      const hasExternalDialog = dialogs.length > 0;
      setExternalDialogOpen(hasExternalDialog);
      if (hasExternalDialog && !supported) queueMicrotask(() => activeTour ? closeTour(false) : setPanel("closed"));
    };
    queueMicrotask(update);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    const onExternalDialog = () => activeTour ? closeTour() : setPanel("closed");
    window.addEventListener("wooly:external-dialog", onExternalDialog);
    return () => { observer.disconnect(); window.removeEventListener("wooly:external-dialog", onExternalDialog); };
  }, [activeTour, audience, closeTour, persistSession]);

  useEffect(() => {
    let timer = 0;
    if (!currentStep || panel !== "tour" || !stepAtLocation(currentStep.route, pathname, locationSearch)) {
      if (currentStep && !stepAtLocation(currentStep.route, pathname, locationSearch)) {
        if (expectedRoute.current === currentStep.route) {
          timer = window.setTimeout(() => setTargetRect(null), 0);
          return () => window.clearTimeout(timer);
        }
        // Practicing an explicit task link may open its next declared page.
        // Only those exact routes preserve the task; other navigation pauses it.
        if (activeTour?.tourId.startsWith("task-")) {
          const nextIndex = activeSteps.findIndex((step, index) => index > currentStepIndex && stepAtLocation(step.route, pathname, locationSearch));
          if (nextIndex >= 0) {
            const next = { ...activeTour, stepIndex: nextIndex, stepId: activeSteps[nextIndex].id };
            queueMicrotask(() => { setActiveTour(next); void persistSession(next, "in_progress"); });
            return;
          }
        }
        if (activeTour) {
          const paused = { ...activeTour, status: "paused" as const };
          void Promise.resolve().then(() => {
            setActiveTour(null);
            setCheckpoints((current) => ({ ...current, [paused.tourId]: paused }));
            setPanel("closed");
            return persistSession(paused, "paused");
          });
        }
      }
      timer = window.setTimeout(() => setTargetRect(null), 0);
      return () => window.clearTimeout(timer);
    }
    if (expectedRoute.current && stepAtLocation(expectedRoute.current, pathname, locationSearch)) expectedRoute.current = null;
    if (dialogSurface || currentStep.surface) { queueMicrotask(() => setTargetRect(null)); return; }
    return trackWoolyTarget(currentStep.target, setTargetRect);
  }, [activeTour, activeSteps, currentStep, currentStepIndex, pathname, locationSearch, panel, persistSession, screenGeneration, dialogSurface]);

  const topics = useMemo(() => audience ? getWoolyHelpTopics(audience, helpQuery, pathname ?? "").filter((topic) => !topic.tourId?.startsWith("task-")) : [], [audience, helpQuery, pathname]);
  const suggestions = useMemo(() => audience ? getWoolyHelpTopics(audience).slice(0, 3) : [], [audience]);
  const openHelp = () => {
    interactionVersion.current += 1;
    focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : launcherRef.current;
    if (activeTour) closeTour();
    setPanel("help");
    setSelectedTopic(null);
    setHelpQuery("");
  };
  const contextValue = useMemo(() => ({ register, unregister, refresh, registerQuickReport }), [register, unregister, refresh, registerQuickReport]);
  const pageGuideId = pathname ? getWoolyPageGuideId(pathname) : null;
  const isOutputPage = pageGuideId === "page-projector" || pageGuideId === "page-confidence" || pageGuideId === "page-remote-session";
  const outputGuideRequested = searchParams?.get("wooly") === "1";
  useEffect(() => {
    if (!isOutputPage || outputGuideRequested || panel === "closed") return;
    queueMicrotask(() => activeTour ? closeTour() : setPanel("closed"));
  }, [activeTour, closeTour, isOutputPage, outputGuideRequested, panel]);
  const availableTourIds = pageGuideId ? [...tourIds, pageGuideId] : tourIds;
  const resumeSteps: Partial<Record<WoolyTourId, string>> = {};
  for (const id of Object.keys(woolyTours) as WoolyTourId[]) {
    const saved = progress[id];
    const step = checkpoints[id]?.stepId ?? (saved && ["paused", "in_progress"].includes(saved.status) ? saved.nextStep : null);
    if (step) resumeSteps[id] = step;
  }
  const panelStyle = panel === "tour" && targetRect && mounted ? (() => {
    if (window.matchMedia("(max-width: 640px)").matches) return undefined;
    const width = Math.min(616, window.innerWidth - 32);
    const height = Math.min(window.innerHeight * 0.75, 672);
    const left = targetRect.right + width + 24 <= window.innerWidth ? targetRect.right + 16 : targetRect.left - width - 16;
    return { left: Math.max(16, Math.min(window.innerWidth - width - 16, left)), top: Math.max(16, Math.min(window.innerHeight - height - 16, targetRect.top)) };
  })() : undefined;
  const tourContent = panel === "tour" && activeTour && currentStep && <div className="wooly-content"><p className="wooly-step-count">Step {currentStepIndex + 1} of {activeSteps.length}</p><h2>{currentStep.title}</h2><WoolyInstructions key={`${activeTour.tourId}:${currentStep.id}`} text={currentStep.body} announcement={`Step ${currentStepIndex + 1} of ${activeSteps.length}: ${currentStep.title}`} />{!targetRect && !dialogSurface && <p className="wooly-fallback">This part of the page is not available right now. Follow the step’s instructions to reveal it, or choose Next to keep reading.</p>}{failedCheckpoints[activeTour.tourId] && <p role="alert" className="wooly-error">Your progress did not sync ({checkpointLabels[failedCheckpoints[activeTour.tourId]!.status]}). The tour is still available. <button type="button" onClick={() => retryCheckpoint(activeTour.tourId)}>Retry</button></p>}<p className="wooly-tour-hint">Use the page’s own buttons to save or submit. Next continues this tutorial.</p><div className="wooly-actions"><button type="button" onClick={() => moveStep(-1)} disabled={currentStepIndex === 0}><ArrowLeft size={16} /> Back</button><button type="button" onClick={() => moveStep(1)} className="wooly-primary">{currentStepIndex + 1 === activeSteps.length ? "Finish" : "Next"}<ArrowRight size={16} /></button><button type="button" onClick={skipTour}>Skip</button></div></div>;
  if (!enabled) return <>{children}</>;

  return <WoolyContext.Provider value={contextValue}>
    {children}
    {mounted && audience && (!isOutputPage || outputGuideRequested) && createPortal(<>
      {!externalDialogOpen && (!isOutputPage || outputGuideRequested) && <button ref={launcherRef} className="wooly-launcher" type="button" aria-label="Wooly" aria-describedby={questions.unread ? "wooly-unread" : undefined} title="Open Wooly" onClick={openHelp}>
        {panel === "closed" && greetingVisible && <span className="wooly-greeting" aria-hidden="true">
          <svg viewBox="0 0 164 116" focusable="false"><path d="M32 20C38 6 61 4 70 18C85 3 110 10 114 27C135 19 157 33 150 51C161 66 143 85 124 78C112 92 89 89 81 78C66 93 43 87 38 75C18 84 3 69 11 53C1 39 13 20 32 20Z" /><circle cx="128" cy="93" r="5" /><circle cx="137" cy="105" r="3" /></svg>
          <span>Need help?</span>
        </span>}
        <WoolyMascot pose="listening" paused={panel !== "closed"} />
        {questions.unread > 0 && <span className="wooly-reply-badge" aria-hidden="true">{questions.unread}</span>}
        {questions.unread > 0 && <span className="wooly-sr-only" id="wooly-unread">{questions.unread} unread support replies.</span>}
      </button>}
      {panel !== "closed" && !dialogSurface && <div ref={panelRef} style={panelStyle} className="wooly-panel" role={panelIsModal ? "dialog" : "region"} aria-modal={panelIsModal || undefined} aria-label={panel === "tour" ? "Wooly guided tour" : "Help with Wooly"} tabIndex={panelIsModal ? -1 : undefined} onKeyDown={(event) => { if (event.key !== "Tab" && event.key !== "Escape") event.stopPropagation(); }}>
        <div className="wooly-companion"><WoolyMascot pose={currentStep?.pose ?? (panel === "help" && chat.view === "chat" && !chat.speakingId ? "listening" : "standing-talking")} pointingDirection={targetRect && panelStyle && panelStyle.left < targetRect.left ? "right" : "left"} /></div>
        <div className="wooly-dialogue"><div className="wooly-dialogue-scroll">
        <header className="wooly-header"><div className="wooly-header-copy"><strong>{panel === "tour" && activeTour ? woolyTours[activeTour.tourId].title : panel === "welcome" ? "Welcome with Wooly" : chat.view === "tutorials" ? selectedTopic?.title ?? "Help with Wooly" : "Help with Wooly"}</strong><span>Gentle guidance, at your pace</span></div><button type="button" aria-label="Close Wooly" onClick={() => panel === "tour" ? closeTour() : setPanel("closed")}><X size={19} /></button></header>
        {panel === "welcome" && <div className="wooly-content"><p>Would you like a short tour? I’ll point out where to click, what each control does, and what happens next. Close the guide to pause, or choose Skip to end it.</p><div className="wooly-actions"><button type="button" className="wooly-primary" onClick={() => { const id = pathname === "/teams/new" ? "creating" : pathname === "/dashboard" ? "essentials" : "joining"; beginTour(id); }}>Start tour</button><button type="button" onClick={() => setPanel("closed")}>Maybe later</button></div></div>}
        {panel === "help" && <div className="wooly-content">
          {openQuickReport && <button type="button" className="wooly-quick-report" aria-label="Quick Report" aria-describedby="wooly-report-description" onClick={() => {
            interactionVersion.current += 1;
            setPanel("closed");
            openQuickReport(() => window.setTimeout(() => launcherRef.current?.focus(), 0));
          }}><Bug size={20} aria-hidden="true" /><span><strong>Quick Report</strong><span id="wooly-report-description">Report a bug or suggest an improvement.</span></span><ArrowRight size={16} aria-hidden="true" /></button>}
          <WoolyHelpViews chat={chat} questions={questions} audience={audience} onTour={beginTour}>
          {pageGuideId && canUseWoolyTour(pageGuideId, audience) && <div className="wooly-page-guide"><strong>Learn this page</strong><p>I’ll point out how to use {woolyTours[pageGuideId].title.toLowerCase()}.</p><button type="button" className="wooly-primary" onClick={() => beginTour(pageGuideId)}>Show me this page <ArrowRight size={16} /></button></div>}
          <WoolyTaskList audience={audience} onTour={beginTour} resumeSteps={resumeSteps} />
          {recordTask && canUseWoolyTour(recordTask, audience) && <p role="status" className="wooly-fallback">Open the record you want to use, then start this task again: {woolyTours[recordTask].title}. <button type="button" onClick={() => { const guide = canUseWoolyTour(recordTask, audience) ? getWoolyGuide(recordTask) : undefined; if (guide) router.push(guide.route.split("/[")[0]); setPanel("closed"); }}>Choose a record</button></p>}
          {pageGuideId === "page-setlist-detail" && <div className="wooly-actions"><button type="button" onClick={() => { router.push(`${pathname}/projector?wooly=1`); setPanel("closed"); }}>Projector guide</button><button type="button" onClick={() => { router.push(`${pathname}/confidence?wooly=1`); setPanel("closed"); }}>Confidence guide</button></div>}
          {Object.entries(failedCheckpoints).filter((entry): entry is [WoolyTourId, TutorialCheckpoint] => Boolean(entry[1])).map(([id, checkpoint]) => <p role="alert" className="wooly-error" key={id}>Progress for {woolyTours[id].title} did not sync ({checkpointLabels[checkpoint.status]}). <button type="button" onClick={() => retryCheckpoint(id)}>Retry</button></p>)}
          {visibleSelectedTopic ? <><p>{visibleSelectedTopic.answer}</p><div className="wooly-actions">{visibleSelectedTopic.tourId && <button type="button" className="wooly-primary" onClick={showSelectedTopicTour}>Show me</button>}{visibleSelectedTopic.route !== "/pending" && visibleSelectedTopic.route !== pathname && <button type="button" onClick={() => { if (!audience || !getWoolyHelpTopics(audience).some((topic) => topic.id === visibleSelectedTopic.id)) return; interactionVersion.current += 1; router.push(visibleSelectedTopic.route); setPanel("closed"); }}>Go to {visibleSelectedTopic.title.toLowerCase()}</button>}</div></> : <><label className="wooly-search"><Search size={16} /><input value={helpQuery} onChange={(event) => setHelpQuery(event.target.value)} placeholder="Search for help" aria-label="Search help topics" /></label><div className="wooly-topic-list">{topics.length ? topics.map((topic) => <button type="button" key={topic.id} onClick={() => setSelectedTopic(topic)}>{topic.title}<ArrowRight size={16} /></button>) : <><p>No exact match. Try one of these topics:</p>{suggestions.map((topic) => <button type="button" key={topic.id} onClick={() => setSelectedTopic(topic)}>{topic.title}<ArrowRight size={16} /></button>)}</>}</div></>}
          <div className="wooly-resume"><strong><BookOpen size={16} /> Your tours</strong>{availableTourIds.filter((id) => canUseWoolyTour(id, audience)).map((id) => {
            const saved = progress[id];
            const memory = checkpoints[id];
            const nextStep = memory?.stepId ?? (saved && (saved.status === "paused" || saved.status === "in_progress") ? saved.nextStep : null);
            return <div key={id}><span>{woolyTours[id].title}</span>{nextStep ? <><button type="button" aria-label={`Resume ${woolyTours[id].title}`} onClick={() => beginTour(id, nextStep)}>Resume</button><button type="button" aria-label={`Restart ${woolyTours[id].title}`} onClick={() => beginTour(id)}>Restart</button></> : <button type="button" aria-label={`Start or replay ${woolyTours[id].title}`} onClick={() => beginTour(id)}>{saved ? "Replay" : "Start"} <RotateCcw size={14} /></button>}</div>;
          })}</div>
          </WoolyHelpViews>
        </div>}
        {tourContent}
        </div></div>
      </div>}
      {panel === "tour" && targetRect && <div className="wooly-spotlight" style={{ left: targetRect.left - 6, top: targetRect.top - 6, width: targetRect.width + 12, height: targetRect.height + 12 }} aria-hidden="true" />}
      {panel === "tour" && targetRect && <WoolyTargetPointer target={targetRect} panelRef={panelRef} />}
      {dialogSurface && panel === "tour" && createPortal(<section className="wooly-inline-guide" aria-label="Wooly task instructions">
        <div className="wooly-inline-header"><strong>Wooly’s guide</strong><button type="button" onClick={() => closeTour()} aria-label="Close Wooly guide">×</button></div>
        {tourContent}
      </section>, dialogSurface)}
    </>, document.body)}
  </WoolyContext.Provider>;
}

export function WoolyScreen({ audience }: WoolyScreenProps) {
  const context = useContext(WoolyContext);
  const { userId, teamId, hasTeam, canManageMembers, session, role } = audience;
  const permissions = audience.permissions;
  useEffect(() => {
    const owner = {};
    context?.register({ userId, teamId, hasTeam, canManageMembers, session, role, permissions }, owner);
    return () => queueMicrotask(() => context?.unregister(owner));
  }, [userId, teamId, hasTeam, canManageMembers, session, role, permissions, context]);
  return null;
}
