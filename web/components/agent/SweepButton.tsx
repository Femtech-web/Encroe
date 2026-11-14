"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Anyone can make the agent sweep now: it only does what anyone may do. */
export function SweepButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/agent", { method: "POST" });
          const body = (await res.json()) as { actions?: { note: string }[]; error?: string };
          setSaid(body.error ?? body.actions?.map((a) => a.note).join(" · ") ?? null);
          setBusy(false);
          router.refresh();
        }}
        disabled={busy}
        className="rounded-md bg-acid px-5 py-3 font-display text-xs font-bold tracking-wide text-void uppercase disabled:opacity-50"
      >
        {busy ? "Sweeping every escrow…" : "Run a sweep now"}
      </button>
      {said && (
        <p role="status" className="text-sm text-ink-2">
          {said}
        </p>
      )}
    </div>
  );
}
