import type { Metadata } from "next";
import { ReviveClient } from "@/components/revive/ReviveClient";

export const metadata: Metadata = {
  title: "Bring the game back",
  description:
    "Revive a released game from public data only: the escrow on NEAR, the sealed package on FastFS, the server in your browser.",
};

export default async function RevivePage({ searchParams }: { searchParams: Promise<{ escrow?: string }> }) {
  const { escrow } = await searchParams;
  return (
    <main>
      <ReviveClient initial={escrow} />
    </main>
  );
}
