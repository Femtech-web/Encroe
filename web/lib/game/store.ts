import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type Stored<T> = { value: T; rev: number };

/** Where the live world is kept: a file on a developer's machine, Upstash Redis on Vercel. */
export interface Store {
  get<T>(key: string): Promise<Stored<T> | null>;
  /** Writes `value` only if the stored revision is still `rev` (0 when absent); false if someone wrote first. */
  put<T>(key: string, value: T, rev: number): Promise<boolean>;
  /** Counts a hit on `key` in a window of `ttlS` seconds and returns the count so far. */
  hit(key: string, ttlS: number): Promise<number>;
}

const PREFIX = "encroe:embergate:";

/** Writes are serialised in-process; one dev server is the only writer. */
export class FileStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();
  private hits = new Map<string, { n: number; until: number }>();

  constructor(private readonly dir: string) {}

  async get<T>(key: string): Promise<Stored<T> | null> {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8")) as Stored<T>;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  put<T>(key: string, value: T, rev: number): Promise<boolean> {
    const run = this.queue.then(async () => {
      if (((await this.get(key))?.rev ?? 0) !== rev) return false;
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.file(key)}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ value, rev: rev + 1 }));
      await rename(tmp, this.file(key));
      return true;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async hit(key: string, ttlS: number): Promise<number> {
    const now = Date.now();
    const cur = this.hits.get(key);
    const next = cur && cur.until > now ? { n: cur.n + 1, until: cur.until } : { n: 1, until: now + ttlS * 1000 };
    this.hits.set(key, next);
    return next.n;
  }

  private file(key: string): string {
    return path.join(this.dir, `${key.replace(/[^a-z0-9-]/gi, "_")}.json`);
  }
}

/** Compare-and-set in one round trip: the revision lives beside the value. */
const CAS = `if tonumber(redis.call('GET', KEYS[2]) or '0') ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tonumber(ARGV[1]) + 1)
return 1`;

export class UpstashStore implements Store {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async get<T>(key: string): Promise<Stored<T> | null> {
    const [value, rev] = (await this.call(["MGET", PREFIX + key, `${PREFIX}${key}:rev`])) as [
      string | null,
      string | null,
    ];
    return value === null ? null : { value: JSON.parse(value) as T, rev: Number(rev ?? 0) };
  }

  async put<T>(key: string, value: T, rev: number): Promise<boolean> {
    const ok = await this.call([
      "EVAL",
      CAS,
      "2",
      PREFIX + key,
      `${PREFIX}${key}:rev`,
      String(rev),
      JSON.stringify(value),
    ]);
    return ok === 1;
  }

  async hit(key: string, ttlS: number): Promise<number> {
    const n = Number(await this.call(["INCR", PREFIX + key]));
    if (n === 1) await this.call(["EXPIRE", PREFIX + key, String(ttlS)]);
    return n;
  }

  private async call(command: string[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`store: ${body.error ?? `HTTP ${res.status}`}`);
    return body.result;
  }
}

let store: Store | undefined;

/** Upstash when its REST credentials are set (either naming Vercel uses), else a file under web/.data. */
export function getStore(): Store {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) store = new UpstashStore(url, token);
  else if (process.env.VERCEL) throw new Error("no store: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
  else store = new FileStore(path.join(process.cwd(), ".data"));
  return store;
}
