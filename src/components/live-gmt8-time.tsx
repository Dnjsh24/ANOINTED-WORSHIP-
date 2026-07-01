"use client";

import { useEffect, useState } from "react";

const gmt8TimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatGmt8Time(date: Date) {
  return `Today at ${gmt8TimeFormatter.format(date)} GMT+8`;
}

export function LiveGmt8Time({ initialNowIso }: { initialNowIso: string }) {
  const [now, setNow] = useState(() => new Date(initialNowIso));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return <span className="text-white font-bold tabular-nums">{formatGmt8Time(now)}</span>;
}
