"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { regenerateTeamCodeAction } from "@/app/actions";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RegenerateTeamCodeButton() {
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const router = useRouter();
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
            try {
              const result = await regenerateTeamCodeAction();
              setOk(result.ok);
              setMessage(result.message);
              if (result.ok) router.refresh();
            } catch {
              setOk(false);
              setMessage("Team code could not be regenerated. Please retry.");
            }
          });
        }}
      >
        <RotateCcw className="size-4" />
        {isPending ? "Generating..." : "Generate new code"}
      </Button>
      {message && <p role="status" className={`text-xs font-bold ${ok ? "text-emerald-300" : "text-amber-300"}`}>{message}</p>}
    </div>
  );
}
