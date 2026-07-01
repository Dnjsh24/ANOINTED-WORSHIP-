"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareButton({ path }: { path: string }) {
  const [message, setMessage] = useState("");

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard?.writeText(url);
      setMessage("Share link copied.");
      return;
    } catch {
      setMessage(`Share link ready: ${url}`);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="primary" onClick={share}>
        <Share2 className="size-4" />
        Share
      </Button>
      {message && (
        <span aria-live="polite" className="text-xs font-bold text-emerald-300">
          {message}
        </span>
      )}
    </div>
  );
}
