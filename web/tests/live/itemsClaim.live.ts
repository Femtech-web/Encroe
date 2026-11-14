import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { expect, it } from "vitest";
import { functionCall } from "@/lib/chain/tx";
import { viewCall } from "@/lib/game/near";

/**
 * A released world's items, taken to Base Sepolia through NEAR Chain Signatures, and the ways it refuses. A player of
 * handover.encroe.testnet signs a claim with their game key; an unrelated NEAR account sends it to encroe-items; the
 * MPC network signs; anyone relays the signature to EncroeItems. Every step is recorded in docs/results/items/.
 *
 *   ITEMS=encroe-items-ba9e16.testnet TOKEN=0x... TO=0x... npx vitest run -c vitest.live.config.ts tests/live/itemsClaim.live.ts
 */
const ROOT = path.join(__dirname, "../../..");
const OUT = path.join(ROOT, "docs/results/items");
const ESCROW = process.env.ESCROW ?? "handover.encroe.testnet";
const ITEMS = process.env.ITEMS!;
const TOKEN = process.env.TOKEN!;
const TO = process.env.TO!.toLowerCase();
const BASE = "https://sepolia.base.org";
const KEYSTORE = process.env.EVM_KEYSTORE!;

type Proof = { pk: string; items: [number, number][]; salt: string; path: [string, boolean][] };
type Signed = {
  claim: { escrow: string; epoch: number; player: string; to: string; ids: number[]; amounts: number[] };
  v: number;
  r: string;
  s: string;
};

const log = (step: string, entry: object) => {
  const line = { at: Math.floor(Date.now() / 1000), step, ...entry };
  appendFileSync(path.join(OUT, "log.jsonl"), JSON.stringify(line) + "\n");
  console.log(JSON.stringify(line));
};
const env = (file: string) =>
  Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Za-z_0-9]+)=(.*)$/))
      .filter((m) => m !== null)
      .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );
const cast = (...args: string[]) => execFileSync("cast", args, { encoding: "utf8" }).trim();

it("hands a released world's items to their owner on Base Sepolia, and refuses everything else", async () => {
  mkdirSync(OUT, { recursive: true });
  const stranger = env(path.join(ROOT, ".env")).stranger;
  const key = JSON.parse(
    readFileSync(path.join(homedir(), `.near-credentials/testnet/${stranger}.json`), "utf8"),
  ).private_key;
  const players = JSON.parse(
    readFileSync(path.join(ROOT, ".secrets/escrow/handover-1-players.json"), "utf8"),
  ) as Proof[];
  const keys = JSON.parse(readFileSync(path.join(ROOT, ".secrets/escrow/handover-keys.json"), "utf8")) as {
    sk: string;
    pk: string;
  }[];
  const me = players[0];
  const sk = keys.find((k) => k.pk === me.pk)!.sk;
  const sign = (secret: string, to: string) =>
    bytesToHex(ed25519.sign(utf8ToBytes(`encroe-claim-v1|${ESCROW}|${to}`), hexToBytes(secret)));
  const args = (over: Partial<Record<string, unknown>> = {}) => ({
    escrow: ESCROW,
    player: me.pk,
    items: me.items,
    salt: me.salt,
    path: me.path,
    to: TO,
    signature: sign(sk, TO),
    ...over,
  });
  // The MPC network signs a few blocks later; an RPC that stops waiting first has still sent the claim.
  const send = (a: object) =>
    functionCall(stranger, key, ITEMS, "claim", a as Record<string, unknown>, 300, { settle: true }).catch(
      (e: Error) => {
        if (/TIMEOUT/i.test(e.message)) return { hash: "(sent; the RPC stopped waiting)", refusal: null };
        throw e;
      },
    );

  // A claim's callbacks run a few blocks after its transaction; views read finalized state, so wait for it to settle.
  const settled = async (escrow: string, player: string) => {
    let got: Signed | "pending" | null = "pending";
    for (let i = 0; i < 40 && got === "pending"; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      got = await viewCall<Signed | "pending" | null>(ITEMS, "get_claim", { escrow, player });
    }
    return got;
  };

  // Refused before anything is asked of NEAR's MPC network.
  const other = keys.find((k) => k.pk !== me.pk)!;
  const forged = await send(args({ signature: sign(other.sk, TO) }));
  log("refused-other-key", { tx: forged.hash, refused: forged.refusal });
  expect(forged.refusal).toContain("did not sign this claim");

  const inflated = await send(args({ items: me.items.map(([id, q]) => [id, q * 10]) }));
  const inflatedState = await settled(ESCROW, me.pk);
  log("refused-inflated-items", { tx: inflated.hash, claim_after: inflatedState });
  expect(inflatedState).toBeNull();

  const live = players[1];
  const liveSk = keys.find((k) => k.pk === live.pk)!.sk;
  const notReleased = await send(
    args({
      escrow: "starhaul.encroe.testnet",
      player: live.pk,
      items: live.items,
      salt: live.salt,
      path: live.path,
      signature: bytesToHex(
        ed25519.sign(utf8ToBytes(`encroe-claim-v1|starhaul.encroe.testnet|${TO}`), hexToBytes(liveSk)),
      ),
    }),
  );
  const notReleasedState = await settled("starhaul.encroe.testnet", live.pk);
  log("refused-live-escrow", { tx: notReleased.hash, claim_after: notReleasedState });
  expect(notReleasedState).toBeNull();

  // The claim.
  const sent = await send(args());
  log("claim", { tx: sent.hash, refused: sent.refusal, player: me.pk, to: TO, items: me.items });
  expect(sent.refusal).toBeNull();
  const signed = await settled(ESCROW, me.pk);
  expect(signed && signed !== "pending").toBeTruthy();
  const c = signed as Signed;
  log("signed-by-mpc", { digest: (c as unknown as { digest: string }).digest, v: c.v, r: c.r, s: c.s });

  const twice = await send(args());
  log("refused-second-claim", { tx: twice.hash, refused: twice.refusal });
  expect(twice.refusal).toContain("already claimed");

  // Anyone relays the MPC signature to Base Sepolia.
  const sig = [
    `${c.claim.escrow}`,
    `${c.claim.epoch}`,
    `0x${c.claim.player}`,
    c.claim.to,
    `[${c.claim.ids}]`,
    `[${c.claim.amounts}]`,
    `${c.v}`,
    c.r,
    c.s,
  ];
  const relay = () =>
    cast(
      "send",
      TOKEN,
      "claim(string,uint64,bytes32,address,uint32[],uint32[],uint8,bytes32,bytes32)",
      ...sig,
      "--rpc-url",
      BASE,
      "--keystore",
      KEYSTORE,
      "--password-file",
      `${KEYSTORE}.password`,
      "--json",
    );
  const receipt = JSON.parse(relay()) as { transactionHash: string; status: string };
  log("relayed-to-base", { tx: receipt.transactionHash, status: receipt.status });
  expect(receipt.status).toBe("0x1");
  const balances = c.claim.ids.map((id) => {
    const tokenId = cast("call", TOKEN, "tokenId(string,uint32)(uint256)", ESCROW, `${id}`, "--rpc-url", BASE).split(
      " ",
    )[0];
    return [
      id,
      cast("call", TOKEN, "balanceOf(address,uint256)(uint256)", TO, tokenId, "--rpc-url", BASE).split(" ")[0],
    ];
  });
  log("balances-on-base", { to: TO, balances });
  expect(balances.map(([, b]) => Number(b))).toEqual(c.claim.amounts);

  let again = "";
  try {
    relay();
  } catch (e) {
    again = String((e as { stderr?: string }).stderr ?? e);
  }
  log("refused-second-relay", { error: again.match(/already claimed/)?.[0] ?? again.slice(0, 120) });
  expect(again).toContain("already claimed");
});
