import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { SealEpochClient } from "@/components/studios/SealEpochClient";

export const metadata: Metadata = {
  title: "Seal your world",
  description:
    "Seal your game's server core and every player's items into your NEAR escrow from your browser, and have the enclave verify it.",
};

export default async function SealPage({ searchParams }: { searchParams: Promise<{ escrow?: string }> }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const { escrow } = await searchParams;
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">
        <Link href="/studios" className="hover:text-ink">
          For studios
        </Link>{" "}
        · step 3
      </p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Seal your world, <span className="text-gold">from here.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        Your core and your players&apos; items are sealed in this tab to the key NEAR&apos;s MPC network keeps for your
        escrow. Three signatures from your wallet, and an enclave checks the sealed build is real without anyone opening
        it.
      </p>
      <p className="mt-3 max-w-2xl text-sm text-ink-3">
        The same steps as <code>scripts/studio/bot.sh seal</code>, which a scheduled job runs for a live game; this page
        is for sealing by hand, or trying it on a test escrow.
      </p>
      <div className="mt-10">
        <SealEpochClient nonce={nonce} initial={typeof escrow === "string" ? escrow : undefined} />
      </div>
    </main>
  );
}
