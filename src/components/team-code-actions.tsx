"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { regenerateTeamCodeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function RegenerateTeamCodeButton() {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={isPending}
        className="mt-5"
        variant="secondary"
        onClick={() => {
          if (!window.confirm("Regenerate the team code? Existing copied codes will stop working.")) {
            return;
          }

          startTransition(async () => {
            const result = await regenerateTeamCodeAction();
            setMessage(result.message);
          });
        }}
      >
        <RotateCcw className="size-4" />
        Reset Code
      </Button>
      {message && <p className="text-xs font-bold text-emerald-300">{message}</p>}
    </div>
  );
}
