"use client";

import { useEffect, useState } from "react";

export function LocalTime({ dateIso }: { dateIso: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return <span>Date unavailable</span>;

  if (!mounted) {
    // Consistent server-side render format using UTC timezone
    const serverFormat = d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC";
    return <span>{serverFormat}</span>;
  }

  // Browser-side render format in user's local timezone
  return (
    <span>
      {d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </span>
  );
}
