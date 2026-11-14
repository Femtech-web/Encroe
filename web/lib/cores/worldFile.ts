type Issue = string;
type Summary = { players: number; kinds: number; items: number; bytes: number };

/** The players file `encore seal --players-file` reads, checked as the CLI and the core will: `[{"pk": hex, "items": [[id, qty], ...]}, ...]`. */
export function checkWorld(text: string): { issues: Issue[]; summary?: Summary } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { issues: ["not JSON"] };
  }
  if (!Array.isArray(data)) return { issues: ["expected a list of players"] };
  const issues: Issue[] = [];
  if (data.length < 1 || data.length > 64) issues.push(`a world has 1 to 64 players, not ${data.length}`);
  const keys = new Set<string>();
  let kinds = 0;
  let items = 0;
  let bytes = 4;
  data.forEach((p, i) => {
    const pk = (p as { pk?: unknown })?.pk;
    const list = (p as { items?: unknown })?.items;
    if (typeof pk !== "string" || !/^[0-9a-f]{64}$/.test(pk))
      issues.push(`player ${i}: pk must be 64 lowercase hex characters`);
    else if (keys.has(pk)) issues.push(`player ${i}: the same key twice`);
    else keys.add(pk);
    if (!Array.isArray(list)) return void issues.push(`player ${i}: items must be a list of [id, qty]`);
    const held = list.filter((x) => Array.isArray(x) && Number(x[1]) > 0);
    if (held.length > 16) issues.push(`player ${i}: at most 16 kinds of item, not ${held.length}`);
    for (const x of list)
      if (!Array.isArray(x) || x.length !== 2 || !x.every((n) => Number.isInteger(n) && n >= 0 && n < 2 ** 32))
        issues.push(`player ${i}: ${JSON.stringify(x)} is not [id, qty] with u32 numbers`);
    kinds += held.length;
    items += held.reduce((n, x) => n + Number(x[1]), 0);
    bytes += 36 + 8 * held.length;
  });
  if (bytes > 16384) issues.push(`the snapshot is ${bytes} bytes; a core's input holds 16384`);
  return { issues: issues.slice(0, 12), summary: { players: data.length, kinds, items, bytes } };
}
