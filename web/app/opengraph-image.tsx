import { ImageResponse } from "next/og";

/** The card X, Telegram and Discord show for a link to the site: the line, the heartbeat, the address. */
export const alt = "Encroe: the studio shut down. The game didn't.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BEAT = "M0 60 H150 l16 -44 l18 88 l16 -62 l12 18 H330 l16 -44 l18 88 l16 -62 l12 18 H520";
const SILENT = "M520 60 H760";
const BACK = "M760 60 l16 -50 l18 96 l16 -70 l12 24 H1080";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "linear-gradient(160deg, #1a0f2e 0%, #07040d 55%, #07040d 100%)",
        color: "#f6f0ff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 900, letterSpacing: 2 }}>
        ENCROE<span style={{ color: "#ff5a1f" }}>.</span>
        <span style={{ marginLeft: 24, fontSize: 20, fontWeight: 400, color: "#9d8fbb", letterSpacing: 6 }}>
          A GAME ESCROW ON NEAR
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 84, fontWeight: 900, lineHeight: 1.02 }}>
        <span>The studio shut down.</span>
        <span style={{ color: "#c6ff3d" }}>The game didn&rsquo;t.</span>
      </div>
      <svg width="1056" height="120" viewBox="0 0 1080 120">
        <path d={BEAT} fill="none" stroke="#9d8fbb" strokeWidth="4" />
        <path d={SILENT} fill="none" stroke="#ff2e88" strokeWidth="4" strokeDasharray="10 10" />
        <path d={BACK} fill="none" stroke="#c6ff3d" strokeWidth="5" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#cdc1e6" }}>
        <span>Sealed in a keyless contract · verified unopened · revived by anyone</span>
        <span style={{ color: "#ff5a1f" }}>encroe.vercel.app</span>
      </div>
    </div>,
    size,
  );
}
