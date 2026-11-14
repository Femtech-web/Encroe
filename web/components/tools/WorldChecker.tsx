"use client";

import { useState } from "react";
import { checkWorld } from "@/lib/cores/worldFile";

export function WorldChecker() {
  const [text, setText] = useState("");
  const result = text.trim() ? checkWorld(text) : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={9}
          aria-label="Players file"
          placeholder='[{"pk": "09022cc5…", "items": [[1, 3], [2, 2]]}]'
          className="w-full rounded-xl border border-line-strong bg-night p-4 font-mono text-xs outline-none focus:border-acid"
        />
        <label className="mt-2 inline-block cursor-pointer text-sm text-acid underline underline-offset-4">
          or load a file
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
          />
        </label>
      </div>
      <div role="status" aria-live="polite">
        {result && (
          <div className="rounded-xl border border-line bg-panel p-5">
            <p className={`font-display text-h2 font-black ${result.issues.length ? "text-flare" : "text-acid"}`}>
              {result.issues.length ? "Fix these first." : "Ready to seal."}
            </p>
            {result.summary && (
              <p className="mt-2 font-mono text-xs text-ink-3">
                {result.summary.players} players · {result.summary.kinds} item kinds · {result.summary.items} items ·{" "}
                {result.summary.bytes} snapshot bytes
              </p>
            )}
            <ul className="mt-3 space-y-1 text-sm text-flare">
              {result.issues.map((i) => (
                <li key={i}>✗ {i}</li>
              ))}
            </ul>
            {!result.issues.length && (
              <p className="mt-3 text-sm text-ink-2">
                Each player gets a fresh salt when you seal, so their leaf hides their items until they show their own
                proof.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
