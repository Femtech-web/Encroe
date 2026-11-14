import type { Metadata } from "next";
import { PlayClient } from "@/components/game/PlayClient";

export const metadata: Metadata = {
  title: "Play Embergate",
  description:
    "A small crafting world whose server is sealed into a NEAR escrow: if the studio goes dark, it goes to its players.",
};

export default function PlayPage() {
  return (
    <main>
      <PlayClient />
    </main>
  );
}
