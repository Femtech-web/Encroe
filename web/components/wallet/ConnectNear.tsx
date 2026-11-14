"use client";

/* eslint-disable @next/next/no-img-element -- wallet icons are local files or embedded in the manifest. */
import { useEffect, useId, useRef, useState } from "react";
import { connect, connectionOptions, disconnect, restore } from "@/lib/wallet/near";
import { useNearAccount } from "@/lib/wallet/useNear";
import manifest from "@/lib/wallet/wallets.json";

const DETAILS: Record<string, string> = {
  "nightly-wallet": "Browser extension",
  "near-cli": "Sign in from your terminal",
  "meteor-wallet": "Extension, web or mobile wallet",
  "intear-wallet": "Connect securely with Intear",
};

/** Connect a NEAR testnet wallet through NEAR Connect (the dialog and flow are Klear's). */
export function ConnectNear({ nonce }: { nonce?: string }) {
  const account = useNearAccount();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => restore(nonce), [nonce]);

  const select = async (id: string) => {
    dialog.current?.close();
    setPending(true);
    setError(null);
    try {
      await connect(nonce, id);
    } catch (e) {
      const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Check your wallet and try again.";
      if (message !== "Wallet closed" && message !== "User rejected") setError(message);
    } finally {
      setPending(false);
    }
  };

  if (account)
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="text-ink-3">Signed in as</span>
        <code className="font-mono break-all text-ink">{account}</code>
        <button
          type="button"
          onClick={() => disconnect().catch(() => setError("Could not disconnect. Try again."))}
          className="cursor-pointer text-acid underline-offset-4 hover:underline"
        >
          Disconnect
        </button>
      </p>
    );

  return (
    <div className="grid justify-items-start gap-2">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return;
          setOptions(null);
          setError(null);
          connectionOptions(nonce).then(setOptions, () => {
            setOptions([]);
            setError("Wallet list unavailable. Close and try again.");
          });
          dialog.current?.showModal();
        }}
        className="rounded-md bg-acid px-5 py-3 font-display text-xs font-bold tracking-wide text-void uppercase aria-disabled:cursor-wait"
      >
        {pending ? "Waiting for your wallet…" : "Connect a NEAR testnet wallet"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-flare">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={title}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-line-strong bg-panel p-5 text-ink backdrop:bg-void/70"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id={title} className="font-display text-lg font-bold">
            Connect a NEAR testnet wallet
          </h2>
          <form method="dialog">
            <button aria-label="Close wallet picker" className="rounded-sm px-2 text-ink-2 hover:text-ink">
              ✕
            </button>
          </form>
        </div>
        <ul className="mt-4 grid gap-2">
          {options === null && <li className="py-3 text-sm text-ink-2">Loading wallets…</li>}
          {options?.length === 0 && <li className="py-3 text-sm text-ink-2">No compatible testnet wallet found.</li>}
          {options?.map(({ id, name }) => {
            const wallet = manifest.wallets.find((w) => w.id === id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => void select(id)}
                  className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-acid"
                >
                  <img src={wallet?.icon ?? "/icon.svg"} alt="" width={32} height={32} className="size-8 rounded-sm" />
                  <span className="flex-1">
                    <span className="block text-sm font-bold">{name}</span>
                    <span className="block text-xs text-ink-3">{DETAILS[id] ?? "Detected testnet wallet"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </dialog>
    </div>
  );
}
