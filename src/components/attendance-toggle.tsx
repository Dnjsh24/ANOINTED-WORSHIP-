"use client";

import { useState, useTransition } from "react";
import { updateAttendanceAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const options = [
  { value: "available", label: "I'm available" },
  { value: "maybe", label: "Maybe" },
  { value: "unavailable", label: "I can't attend" },
] as const;

export function AttendanceToggle({
  eventId,
  initialStatus = "pending",
}: {
  eventId: string;
  initialStatus?: "available" | "maybe" | "unavailable" | "pending";
}) {
  const [selected, setSelected] = useState<string>(
    initialStatus === "pending" ? "" : initialStatus
  );
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [isPending, startTransition] = useTransition();

  function updateStatus(status: (typeof options)[number]["value"]) {
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("status", status);

    startTransition(async () => {
      const result = await updateAttendanceAction(formData);
      setMessage(result.message || (result.ok ? `Marked ${status}.` : "Attendance could not be updated."));
      setMessageOk(result.ok);
      if (result.ok) {
        setSelected(status);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            disabled={isPending}
            variant={selected === option.value ? "primary" : "secondary"}
            onClick={() => updateStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {message && (
        <p aria-live="polite" className={messageOk ? "mt-3 text-sm font-bold text-emerald-300" : "mt-3 text-sm font-bold text-amber-200"}>
          {message}
        </p>
      )}
    </div>
  );
}
