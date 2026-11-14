"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ReleasePanel } from "@/components/revive/ReleasePanel";

/** The release panel on an escrow's page: once NEAR shows the key published, it sends you to bring the game back. */
export function ReleaseAction({ escrow, lapsesAt }: { escrow: string; lapsesAt: number }) {
  const router = useRouter();
  const done = useCallback(() => router.push(`/revive?escrow=${escrow}`), [router, escrow]);
  return <ReleasePanel escrow={escrow} lapsesAt={lapsesAt} onReleased={done} />;
}
