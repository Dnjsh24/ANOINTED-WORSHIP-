"use client";

import { useEffect, useState } from "react";

export function useWoolyGreeting(enabled: boolean) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => setVisible(false), 10_000);

    const showGreeting = () => {
      window.clearTimeout(timer);
      setVisible(true);
      timer = window.setTimeout(() => setVisible(false), 10_000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") showGreeting();
      else { window.clearTimeout(timer); setVisible(false); }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && document.visibilityState === "visible") showGreeting();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [enabled]);

  return enabled && visible;
}
