"use client";

import { useState } from "react";
import { CATALOGS } from "@/lib/cores/catalog";
import { checkCore, type CoreReport } from "@/lib/cores/check";

const OURS = [
  ["embergate.wasm", "Embergate · Rust"],
  ["matchday.wasm", "Matchday · C++"],
  ["neon-city.wasm", "Neon City · C"],
];

/** Your compiled core, checked in your browser against what the enclave will check. Nothing is uploaded. */
export function CoreChecker() {
  const [report, setReport] = useState<CoreReport | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(bytes: Uint8Array, label: string) {
    setBusy(true);
    setName(label);
    setReport(null);
    setReport(await checkCore(bytes));
    setBusy(false);
  }

  const known = report ? CATALOGS[report.sha256] : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong bg-night p-6 text-center hover:border-acid">
          <span className="font-display font-bold">Drop your core.wasm here</span>
          <span className="mt-1 text-sm text-ink-3">or click to choose it. It never leaves your browser.</span>
          <input
            type="file"
            accept=".wasm,application/wasm"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await run(new Uint8Array(await f.arrayBuffer()), f.name);
            }}
          />
        </label>
        <p className="mt-4 text-sm text-ink-3">Or check one of the cores we sealed:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {OURS.map(([file, label]) => (
            <button
              key={file}
              disabled={busy}
              onClick={async () => run(new Uint8Array(await (await fetch(`/core/${file}`)).arrayBuffer()), label)}
              className="rounded-sm border border-line px-3 py-1.5 font-mono text-xs text-ink-2 hover:border-acid hover:text-acid"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div role="status" aria-live="polite">
        {busy && <p className="text-sm text-ink-2">Running {name} through three worlds of 64 players…</p>}
        {report && (
          <div className="animate-rise rounded-xl border border-line bg-panel p-5">
            <p className={`font-display text-h2 font-black ${report.ok ? "text-acid" : "text-flare"}`}>
              {report.ok ? "Ready to seal." : "Not ready yet."}
            </p>
            <p className="mt-1 font-mono text-xs break-all text-ink-3">
              {name} · sha256 {report.sha256}
              {known ? ` · ${known.game} (${known.language}), a core we sealed` : ""}
            </p>
            <ol className="mt-4 space-y-2">
              {report.checks.map((c) => (
                <li key={c.id} className="flex gap-3 text-sm">
                  <span className={c.ok ? "text-acid" : "text-flare"}>{c.ok ? "✓" : "✗"}</span>
                  <span className="min-w-0">
                    <span className="font-bold">{c.label}</span>
                    <span className="block font-mono text-xs break-words text-ink-3">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            {report.moves.length > 0 && (
              <p className="mt-4 text-xs text-ink-3">
                Its own moves: <span className="font-mono text-ink-2">{report.moves.join(", ")}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
