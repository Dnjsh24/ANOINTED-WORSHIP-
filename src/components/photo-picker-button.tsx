"use client";

import { useRef, useState } from "react";

export function PhotoPickerButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  return (
    <div className="mt-4 w-full text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          setStatus(file ? `${file.name} selected. Upload storage is not connected yet.` : "");
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.08]"
      >
        Change Photo
      </button>
      {status ? (
        <p aria-live="polite" className="mt-2 text-[10px] font-semibold text-zinc-500">
          {status}
        </p>
      ) : null}
    </div>
  );
}
