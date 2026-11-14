import type { GameId } from "./games";
import { qtyOf, renown, title, type Items } from "./items";

/** How a player ranks in each game, and what the board calls them. */
export function standing(game: GameId, items: Items): { score: number; title: string } {
  switch (game) {
    case "embergate":
      return { score: renown(items), title: title(items) };
    case "matchday": {
      const trophies = qtyOf(items, 6);
      const cards = items.filter(([id]) => id >= 100).reduce((n, [, q]) => n + q, 0);
      return {
        score: qtyOf(items, 1) + 500 * trophies + 25 * cards,
        title: trophies ? `${trophies} ${trophies === 1 ? "trophy" : "trophies"}` : `${cards} cards`,
      };
    }
    case "neon-city": {
      const respect = qtyOf(items, 4);
      return {
        score: qtyOf(items, 1) + 10 * respect + 100 * items.filter(([id]) => id >= 20).length,
        title: respect >= 50 ? "Kingpin" : respect >= 20 ? "Fixer" : respect >= 5 ? "Driver" : "Newcomer",
      };
    }
  }
}
