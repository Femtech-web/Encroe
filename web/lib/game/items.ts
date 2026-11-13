/** Embergate's items and recipes, mirroring crates/embergate-core (core.test.ts checks every recipe against it). */

export type ItemId = 1 | 2 | 3 | 4 | 5 | 6 | 9 | 10 | 11 | 12 | 13 | 14;

export type Item = { id: ItemId; name: string; kind: "material" | "relic"; color: string; lore: string };

export const ITEMS: Record<ItemId, Item> = {
  1: { id: 1, name: "Ember", kind: "material", color: "#ff5a1f", lore: "A coal that never cools." },
  2: { id: 2, name: "Ore", kind: "material", color: "#8fa3c7", lore: "Iron from under the gate." },
  3: { id: 3, name: "Crystal", kind: "material", color: "#3de0ff", lore: "It hums when you hold it." },
  4: { id: 4, name: "Timber", kind: "material", color: "#9bcf53", lore: "Ashwood, light and stubborn." },
  5: { id: 5, name: "Moonsilk", kind: "material", color: "#d9c8ff", lore: "Spun only on dark nights." },
  6: { id: 6, name: "Ash", kind: "material", color: "#b4a9a0", lore: "What a phoenix leaves behind." },
  9: { id: 9, name: "Lantern", kind: "relic", color: "#ffc23d", lore: "Lights a road no one else sees." },
  10: { id: 10, name: "Blade", kind: "relic", color: "#e6ecff", lore: "Forged once, sharp forever." },
  11: { id: 11, name: "Prism", kind: "relic", color: "#7af0ff", lore: "Splits one light into six." },
  12: { id: 12, name: "Bow", kind: "relic", color: "#c6ff3d", lore: "Strung with moonsilk." },
  13: { id: 13, name: "Crown", kind: "relic", color: "#ff2e88", lore: "Worn by whoever kept the fire." },
  14: { id: 14, name: "Phoenix", kind: "relic", color: "#ff7a1a", lore: "Proof the game outlived its makers." },
};

/** The six nodes: node `n` yields material `n`. */
export const NODES: ItemId[] = [1, 2, 3, 4, 5, 6];

export type Recipe = { id: number; product: ItemId; needs: [ItemId, number][] };

/** Recipe ids are the core's: `craft(player, id)`. */
export const RECIPES: Recipe[] = [
  {
    id: 1,
    product: 9,
    needs: [
      [1, 2],
      [2, 1],
    ],
  },
  {
    id: 2,
    product: 10,
    needs: [
      [1, 1],
      [2, 3],
    ],
  },
  {
    id: 3,
    product: 11,
    needs: [
      [3, 3],
      [5, 1],
    ],
  },
  {
    id: 4,
    product: 12,
    needs: [
      [4, 3],
      [5, 1],
    ],
  },
  {
    id: 5,
    product: 13,
    needs: [
      [6, 2],
      [9, 1],
      [11, 1],
    ],
  },
  {
    id: 6,
    product: 14,
    needs: [
      [1, 5],
      [10, 1],
      [12, 1],
      [13, 1],
    ],
  },
];

export const STARTER: [ItemId, number][] = [
  [1, 3],
  [2, 2],
];

/** The core's return codes. */
export const OUTCOMES: Record<number, string> = {
  0: "ok",
  1: "not enough items",
  2: "no such player",
  3: "satchel full",
  4: "already gathered this tick",
  5: "no such node or recipe",
};

export type Items = [number, number][];

export function qtyOf(items: Items, id: number): number {
  return items.find(([i]) => i === id)?.[1] ?? 0;
}

export function canForge(items: Items, recipe: Recipe): boolean {
  return recipe.needs.every(([id, q]) => qtyOf(items, id) >= q);
}

/** A player's standing: relics count for more the deeper they sit in the recipe tree. */
export function renown(items: Items): number {
  const weight: Partial<Record<number, number>> = { 9: 4, 10: 5, 11: 5, 12: 5, 13: 20, 14: 60 };
  return items.reduce((sum, [id, q]) => sum + (weight[id] ?? 1) * q, 0);
}

/** A player's title: the deepest relic they hold. */
export function title(items: Items): string {
  for (const id of [14, 13, 12, 11, 10, 9] as const) if (qtyOf(items, id) > 0) return `${ITEMS[id].name}-bearer`;
  return "Wanderer";
}
