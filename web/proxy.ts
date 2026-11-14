import { NextResponse, type NextRequest } from "next/server";
import { RPCS } from "@/lib/game/near";

/**
 * A strict Content-Security-Policy with a fresh nonce per request. The browser talks to this site, to NEAR's public
 * RPCs and to FastFS (sealed packages on NEAR), which it reads directly so its checks never rest on our word. WebAssembly is allowed because the
 * browser runs the sealed game core itself after a release.
 */
/** Pages where a studio connects a NEAR wallet: NEAR Connect runs the wallet's code in a sandboxed iframe that
 * inherits this policy, so these pages also allow the wallets' hosts, and nothing else. */
const WALLET_PAGES = /^\/(studios(\/seal)?|escrow\/[^/]+)$/;
const WALLET_HOSTS = [
  "https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/nightly.js",
  "https://raw.githubusercontent.com/near/near-cli-connect/refs/heads/main/dist/near-cli.js",
  "https://wallet.intear.tech/near-selector.js",
  "https://mc.meteorwallet.app",
  "wss://mc.meteorwallet.app",
  "wss://logout-bridge-service.intear.tech",
  "https://rpc.testnet.fastnear.com",
  "https://archival-rpc.testnet.fastnear.com",
];

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === "development";
  const wallet = WALLET_PAGES.test(request.nextUrl.pathname);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${wallet ? " https://raw.githubusercontent.com https://storage.herewallet.app" : ""}`,
    "font-src 'self'",
    `connect-src 'self' ${RPCS.join(" ")} https://test.fastfs.io${wallet ? " " + WALLET_HOSTS.join(" ") : ""}${dev ? " ws: http://127.0.0.1:* http://localhost:*" : ""}`,
    wallet ? "frame-src 'self' https://wallet.intear.tech" : "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|core/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
