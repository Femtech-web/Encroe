import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LivePlayClient } from "@/components/play/LivePlayClient";
import { GAMES, isGame } from "@/lib/game/games";

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  return isGame(game) ? { title: `Play ${GAMES[game].name}`, description: GAMES[game].blurb } : {};
}

export default async function PlayGame({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGame(game) || game === "embergate") notFound();
  return (
    <main>
      <LivePlayClient game={game} />
    </main>
  );
}
