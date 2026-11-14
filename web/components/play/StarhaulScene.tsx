"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SceneProps } from "./scenes";

/**
 * Starhaul's sector, in 3D: the station, four asteroid belts and every pilot on the board. The scene only shows; the
 * sealed Zig core decides. Clicking a belt sends the same `mine` move as the panel, and a pilot's ship flies to where
 * the core says they worked.
 */

const BELTS = [
  {
    n: 1,
    name: "Inner belt",
    ship: 20,
    needs: "a skiff",
    radius: 16,
    spread: 2.2,
    color: 0x9a8c7e,
    count: 280,
    ore: "ore",
  },
  {
    n: 2,
    name: "Ice ring",
    ship: 22,
    needs: "an ice cutter",
    radius: 23,
    spread: 1.6,
    color: 0xbfe7ff,
    count: 240,
    ore: "ice",
  },
  {
    n: 3,
    name: "Outer belt",
    ship: 21,
    needs: "a hauler",
    radius: 31,
    spread: 2.8,
    color: 0xb8653a,
    count: 340,
    ore: "ore",
  },
  {
    n: 4,
    name: "Deep field",
    ship: 23,
    needs: "a deep miner",
    radius: 40,
    spread: 3.2,
    color: 0x5a2335,
    count: 260,
    ore: "alloy",
  },
] as const;
const ACID = 0xc6ff3d;
const GOLD = 0xffc23d;
const HUD: [number, string][] = [
  [1, "Credits"],
  [2, "Fuel"],
  [3, "Ore"],
  [4, "Ice"],
  [5, "Alloy"],
  [6, "Standing"],
];

type Leg =
  | { kind: "fly"; to: THREE.Vector3; dur: number }
  | { kind: "work"; at: THREE.Vector3; dur: number; beam: boolean }
  | { kind: "home"; dur: number };
type Ship = {
  pk: string;
  group: THREE.Group;
  label: HTMLDivElement;
  phase: number;
  orbit: number;
  legs: Leg[];
  leg?: { leg: Leg; from: THREE.Vector3; start: number };
  flash: number;
};
type Float = { el: HTMLDivElement; ship: Ship; start: number };

function seed(pk: string): number {
  let h = 2166136261;
  for (let i = 0; i < pk.length; i++) h = Math.imul(h ^ pk.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

function glow(color: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, color);
  r.addColorStop(0.25, color.replace(/[\d.]+\)$/, "0.35)"));
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeShip(color: number, mine: boolean): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.35,
    emissive: color,
    emissiveIntensity: mine ? 0.35 : 0.12,
  });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 8), hull);
  body.rotation.x = Math.PI / 2;
  const wings = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.5), hull);
  wings.position.z = -0.35;
  const engine = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow(mine ? "rgba(198,255,61,1)" : "rgba(255,194,61,1)"),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  engine.scale.setScalar(mine ? 1.6 : 1.1);
  engine.position.z = -0.9;
  g.add(body, wings, engine);
  g.scale.setScalar(mine ? 1.25 : 0.95);
  return g;
}

/** Where a pilot idles: an orbit of the station of its own radius, height and phase. */
function homeAt(s: Ship, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = s.phase * Math.PI * 2 + t * (0.12 + 0.05 * s.phase);
  return out.set(
    Math.cos(a) * s.orbit,
    1.2 + Math.sin(t * 0.6 + s.phase * 9) * 0.5 + (s.phase - 0.5) * 3,
    Math.sin(a) * s.orbit,
  );
}

function beltPoint(belt: number, angle: number): THREE.Vector3 {
  const b = BELTS[belt - 1];
  return new THREE.Vector3(Math.cos(angle) * b.radius, 0.6, Math.sin(angle) * b.radius);
}

export function StarhaulScene({ me, pk, board, events, last, act, busy, live, players }: SceneProps) {
  const mount = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const api = useRef<{
    syncShips(list: { pk: string; name: string }[]): void;
    send(pk: string, legs: Leg[], text?: string, color?: string): void;
    flash(pk: string): void;
    reach(owned: Set<number>): void;
  } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const actRef = useRef(act);
  const busyRef = useRef(busy);
  useEffect(() => {
    actRef.current = act;
    busyRef.current = busy;
  }, [act, busy]);

  useEffect(() => {
    const host = mount.current;
    const layer = overlay.current;
    if (!host || !layer) return;
    const labels: HTMLDivElement = layer;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    // Sharp enough on a retina screen at a third less work than full resolution.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.className = "block h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05030a);
    scene.fog = new THREE.FogExp2(0x05030a, 0.006);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 2000);
    camera.position.set(0, 34, 58);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 18;
    controls.maxDistance = 160;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 0.25;

    // Light: a far sun, a cold fill, the station's own glow.
    scene.add(new THREE.AmbientLight(0x6b5c99, 0.55));
    const sunLight = new THREE.DirectionalLight(0xffe2b8, 2.2);
    sunLight.position.set(-160, 60, -120);
    scene.add(sunLight);
    const stationLight = new THREE.PointLight(ACID, 30, 40, 2);
    stationLight.position.set(0, 3, 0);
    scene.add(stationLight);

    const disposables: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

    // The sun and the stars.
    const sun = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: keep(glow("rgba(255,190,110,1)")),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    sun.position.set(-320, 120, -260);
    sun.scale.setScalar(160);
    scene.add(sun);
    const starGeo = keep(new THREE.BufferGeometry());
    const stars = new Float32Array(2400 * 3);
    for (let i = 0; i < 2400; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(420 + Math.random() * 300);
      stars.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        keep(new THREE.PointsMaterial({ color: 0xd6c4ff, size: 1.4, sizeAttenuation: false, fog: false })),
      ),
    );

    // The station: a hub, a ring, spokes and beacons.
    const station = new THREE.Group();
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0x8e86a8, metalness: 0.8, roughness: 0.3 }));
    const lit = keep(
      new THREE.MeshStandardMaterial({
        color: ACID,
        emissive: ACID,
        emissiveIntensity: 0.6,
        metalness: 0.4,
        roughness: 0.4,
      }),
    );
    station.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.4, 3.6, 18)), metal));
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(3.6, 0.32, 12, 64)), lit);
    ring.rotation.x = Math.PI / 2;
    station.add(ring);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(keep(new THREE.BoxGeometry(7.2, 0.14, 0.14)), metal);
      spoke.rotation.y = (i * Math.PI) / 4;
      station.add(spoke);
    }
    const beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: keep(glow("rgba(198,255,61,1)")),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    beacon.position.y = 2.4;
    beacon.scale.setScalar(4);
    station.add(beacon);
    scene.add(station);

    // The belts: instanced rocks on slowly turning rings, and a band to hover and click.
    const rock = keep(new THREE.IcosahedronGeometry(1, 0));
    const belts = BELTS.map((b) => {
      const group = new THREE.Group();
      const mat = keep(
        new THREE.MeshStandardMaterial({
          color: b.color,
          flatShading: true,
          roughness: b.n === 2 ? 0.25 : 0.9,
          metalness: b.n === 4 ? 0.5 : 0.1,
          emissive: b.n === 2 ? 0x1d4a66 : b.n === 4 ? 0x3a0d1c : 0x000000,
          emissiveIntensity: 0.6,
        }),
      );
      const rocks = new THREE.InstancedMesh(rock, mat, b.count);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (let i = 0; i < b.count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = b.radius + (Math.random() + Math.random() - 1) * b.spread;
        const s = 0.18 + Math.random() ** 3 * (b.n === 4 ? 1.1 : 0.8);
        q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
        m.compose(
          new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * b.spread * 0.5, Math.sin(a) * r),
          q,
          new THREE.Vector3(s, s * (0.6 + Math.random() * 0.6), s),
        );
        rocks.setMatrixAt(i, m);
      }
      group.add(rocks);
      if (b.n === 4) {
        // Native alloy glinting in the deep field.
        const glints = keep(new THREE.BufferGeometry());
        const pts = new Float32Array(90 * 3);
        for (let i = 0; i < 90; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = b.radius + (Math.random() - 0.5) * b.spread * 2;
          pts.set([Math.cos(a) * r, (Math.random() - 0.5) * 1.5, Math.sin(a) * r], i * 3);
        }
        glints.setAttribute("position", new THREE.BufferAttribute(pts, 3));
        group.add(
          new THREE.Points(
            glints,
            keep(
              new THREE.PointsMaterial({ color: GOLD, size: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
            ),
          ),
        );
      }
      const bandMat = keep(
        new THREE.MeshBasicMaterial({
          color: b.color,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const band = new THREE.Mesh(
        keep(new THREE.RingGeometry(b.radius - b.spread - 1, b.radius + b.spread + 1, 128)),
        bandMat,
      );
      band.rotation.x = -Math.PI / 2;
      band.userData.belt = b.n;
      scene.add(group, band);

      const label = document.createElement("div");
      label.className =
        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase backdrop-blur-sm transition-opacity";
      labels.appendChild(label);
      return {
        b,
        group,
        band,
        bandMat,
        label,
        anchor: beltPoint(b.n, Math.PI * 0.3 + (b.n - 1) * Math.PI * 0.5).setY(2.2),
        reachable: b.n === 1,
      };
    });

    // Whether this pilot has joined (before that, no belt "needs" anything) and whether the frame is phone-narrow.
    let joined = false;
    let narrow = false;

    // Ships and floating words.
    const ships = new Map<string, Ship>();
    const floats: Float[] = [];
    const beamGeo = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
    const beams = new Map<Ship, THREE.Line>();
    const clock = new THREE.Clock();

    function shipLabel(text: string, mine: boolean): HTMLDivElement {
      const el = document.createElement("div");
      el.className = `pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] ${mine ? "font-bold text-[#c6ff3d]" : "text-[#cdc1e6]/70"}`;
      el.textContent = text;
      labels.appendChild(el);
      return el;
    }

    api.current = {
      syncShips(list) {
        const wanted = new Set(list.map((p) => p.pk));
        for (const [key, s] of ships)
          if (!wanted.has(key)) {
            scene.remove(s.group);
            s.label.remove();
            ships.delete(key);
          }
        for (const p of list) {
          const existing = ships.get(p.pk);
          const mine = p.pk === pk;
          if (existing) {
            existing.label.textContent = mine ? `${p.name} · you` : p.name;
            continue;
          }
          const f = seed(p.pk);
          const s: Ship = {
            pk: p.pk,
            group: makeShip(mine ? ACID : GOLD, mine),
            label: shipLabel(mine ? `${p.name} · you` : p.name, mine),
            phase: f,
            orbit: mine ? 7.5 : 6 + f * 6,
            legs: [],
            flash: 0,
          };
          homeAt(s, clock.getElapsedTime(), s.group.position);
          scene.add(s.group);
          ships.set(p.pk, s);
        }
      },
      send(key, legs, text, color = "#c6ff3d") {
        const s = ships.get(key);
        if (!s) return;
        s.legs.push(...legs);
        if (text) {
          const el = document.createElement("div");
          el.className =
            "pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-display text-sm font-black drop-shadow";
          el.style.color = color;
          el.textContent = text;
          labels.appendChild(el);
          const delay = legs.reduce((t, l) => t + (l.kind === "home" ? 0 : l.dur), 0) * 0.85;
          floats.push({ el, ship: s, start: clock.getElapsedTime() + delay });
          el.style.opacity = "0";
        }
      },
      flash(key) {
        const s = ships.get(key);
        if (s) s.flash = 1;
      },
      reach(owned) {
        joined = owned.size > 0;
        for (const belt of belts) belt.reachable = owned.has(belt.b.ship);
      },
    };

    // Picking a belt.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered: number | null = null;
    let down: { x: number; y: number } | null = null;
    const pick = (e: PointerEvent): number | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(belts.map((b) => b.band))[0];
      if (!hit) return null;
      // Bands overlap at their edges; the nearest ring to the hit point wins.
      const d = Math.hypot(hit.point.x, hit.point.z);
      return belts.reduce(
        (best, b) => (Math.abs(b.b.radius - d) < Math.abs(BELTS[best - 1].radius - d) ? b.b.n : best),
        1,
      );
    };
    const onMove = (e: PointerEvent) => {
      const b = pick(e);
      if (b !== hovered) {
        hovered = b;
        setHover(b);
        renderer.domElement.style.cursor = b ? "pointer" : "grab";
      }
    };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const b = pick(e);
      if (b && !busyRef.current) actRef.current("mine", [b]);
    };
    const onLeave = () => {
      hovered = null;
      setHover(null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    // A portrait screen sees less of the sector across, so the camera stands back until every belt fits.
    const BASE_DISTANCE = camera.position.length();
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      camera.position.setLength(BASE_DISTANCE * Math.max(1, 1.45 / camera.aspect));
      controls.update();
      narrow = w < 640;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);

    const screen = new THREE.Vector3();
    const place = (el: HTMLElement, at: THREE.Vector3, dy = 0) => {
      screen.copy(at).project(camera);
      const behind = screen.z > 1;
      // Labels are centred on their point; keep each one inside the frame.
      const half = el.offsetWidth / 2 + 6;
      const x = ((screen.x + 1) / 2) * host.clientWidth;
      el.style.left = `${Math.min(Math.max(x, half), host.clientWidth - half)}px`;
      el.style.top = `${((1 - screen.y) / 2) * host.clientHeight + dy}px`;
      el.style.visibility = behind ? "hidden" : "visible";
    };
    const tmp = new THREE.Vector3();
    const look = new THREE.Vector3();
    let frame = 0;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();
      controls.update();
      station.rotation.y += dt * 0.15;
      beacon.material.opacity = 0.55 + Math.sin(t * 3) * 0.35;
      belts.forEach((belt, i) => {
        belt.group.rotation.y += dt * (0.05 / (i + 1));
        const on = hovered === belt.b.n;
        belt.bandMat.opacity += ((on ? 0.12 : 0) - belt.bandMat.opacity) * Math.min(dt * 10, 1);
        belt.label.textContent =
          belt.reachable || !joined || narrow ? belt.b.name : `${belt.b.name} · needs ${belt.b.needs}`;
        belt.label.style.borderColor = on ? "#c6ff3d" : "rgba(214,196,255,0.2)";
        belt.label.style.color = belt.reachable ? (on ? "#c6ff3d" : "#f6f0ff") : "#9d8fbb";
        belt.label.style.background = "rgba(13,8,23,0.55)";
        place(belt.label, belt.anchor);
      });

      for (const s of ships.values()) {
        if (!s.leg && s.legs.length) s.leg = { leg: s.legs.shift()!, from: s.group.position.clone(), start: t };
        const prev = s.group.position.clone();
        if (s.leg) {
          const { leg, from, start } = s.leg;
          const dur = reduced ? leg.dur * 0.3 : leg.dur;
          const k = Math.min((t - start) / dur, 1);
          const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          if (leg.kind === "work") {
            s.group.position
              .copy(leg.at)
              .add(tmp.set(Math.sin(t * 2) * 0.4, 0.8 + Math.sin(t * 3) * 0.2, Math.cos(t * 2) * 0.4));
            let beam = beams.get(s);
            if (leg.beam && !beam) {
              beam = new THREE.Line(
                beamGeo.clone(),
                new THREE.LineBasicMaterial({ color: ACID, transparent: true, blending: THREE.AdditiveBlending }),
              );
              beams.set(s, beam);
              scene.add(beam);
            }
            if (beam) {
              beam.geometry.setFromPoints([s.group.position, leg.at]);
              (beam.material as THREE.LineBasicMaterial).opacity = 0.5 + Math.random() * 0.5;
            }
          } else {
            const to = leg.kind === "home" ? homeAt(s, start + dur) : leg.to;
            const mid = tmp
              .copy(from)
              .lerp(to, 0.5)
              .add(look.set(0, 4 + from.distanceTo(to) * 0.15, 0));
            const a = from.clone().lerp(mid, ease);
            const b = mid.clone().lerp(to, ease);
            s.group.position.copy(a.lerp(b, ease));
          }
          if (k >= 1) {
            if (leg.kind === "work") {
              const beam = beams.get(s);
              if (beam) {
                scene.remove(beam);
                beam.geometry.dispose();
                (beam.material as THREE.Material).dispose();
                beams.delete(s);
              }
            }
            s.leg = undefined;
          }
        } else {
          homeAt(s, t, s.group.position);
        }
        if (s.group.position.distanceToSquared(prev) > 1e-6) {
          look.copy(s.group.position).add(s.group.position).sub(prev);
          s.group.lookAt(look);
        }
        s.flash = Math.max(0, s.flash - dt * 1.5);
        s.group.scale.setScalar((s.pk === pk ? 1.25 : 0.95) * (1 + s.flash * 0.6));
        place(s.label, tmp.copy(s.group.position).add(look.set(0, 1.4, 0)));
      }

      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        const k = (t - f.start) / 2.2;
        if (k < 0) continue;
        if (k >= 1) {
          f.el.remove();
          floats.splice(i, 1);
          continue;
        }
        f.el.style.opacity = String(k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
        place(f.el, tmp.copy(f.ship.group.position).add(look.set(0, 2.2, 0)), -k * 36);
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Line) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            (m as THREE.SpriteMaterial).map?.dispose();
            m.dispose();
          });
        }
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.replaceChildren();
      api.current = null;
    };
  }, [pk]);

  // Pilots on the board, and which belts this pilot's ships reach.
  useEffect(() => {
    const list = board.map((b) => ({ pk: b.pk, name: b.name }));
    if (me && !list.some((p) => p.pk === pk)) list.push({ pk, name: me.name });
    api.current?.syncShips(list);
    api.current?.reach(new Set((me?.items ?? []).map(([id]) => id)));
  }, [board, me, pk]);

  // This pilot's last move, as the core decided it.
  const seen = useRef(0);
  useEffect(() => {
    if (!last || last.n === seen.current) return;
    seen.current = last.n;
    const a = api.current;
    if (!a) return;
    if (!last.ok) return (a.flash(pk), a.send(pk, [], last.text, "#ff2e88"));
    if (last.move === "mine") {
      const at = beltPoint(last.args[0] ?? 1, Math.random() * Math.PI * 2);
      a.send(
        pk,
        [
          { kind: "fly", to: at.clone().setY(2.5), dur: 1.8 },
          { kind: "work", at, dur: 1.6, beam: true },
          { kind: "home", dur: 2 },
        ],
        last.text,
      );
    } else if (last.move === "deliver" || last.move === "refine") {
      a.send(
        pk,
        [
          { kind: "fly", to: new THREE.Vector3(0, 1, 4.2), dur: 1.4 },
          { kind: "work", at: new THREE.Vector3(0, 0.4, 3.6), dur: 1, beam: false },
          { kind: "home", dur: 1.4 },
        ],
        last.text,
        "#ffc23d",
      );
    } else {
      a.flash(pk);
      a.send(pk, [], last.text, "#ffc23d");
    }
  }, [last, pk]);

  // Other pilots' moves, from the feed: their ships go where the words say they worked.
  const feed = useRef<string[] | null>(null);
  useEffect(() => {
    const before = feed.current;
    feed.current = events;
    const a = api.current;
    if (!before || !a) return;
    const fresh = events.slice(0, Math.max(0, events.indexOf(before[0] ?? "")));
    for (const e of fresh) {
      const who = board.find((b) => b.pk !== pk && e.startsWith(`${b.name}:`));
      if (!who) continue;
      const belt =
        /\balloy\b/.test(e) && !/credits/.test(e)
          ? 4
          : /\bice\b/.test(e) && !/credits/.test(e)
            ? 2
            : /\bore\b/.test(e) && !/credits/.test(e)
              ? 1 + 2 * Math.round(seed(e))
              : 0;
      const at = belt ? beltPoint(belt, seed(e + "a") * Math.PI * 2) : new THREE.Vector3(0, 0.4, -3.6);
      a.send(
        who.pk,
        [
          { kind: "fly", to: at.clone().setY(2.5), dur: 2 },
          { kind: "work", at, dur: 1.4, beam: belt > 0 },
          { kind: "home", dur: 2 },
        ],
        e.slice(who.name.length + 2),
        "#cdc1e6",
      );
    }
  }, [events, board, pk]);

  const held = new Map(me?.items ?? []);
  const belt = hover ? BELTS[hover - 1] : null;
  return (
    <div className="relative overflow-hidden rounded-xl border border-line-strong bg-void">
      <div ref={mount} className="h-[380px] w-full sm:h-[460px] lg:h-[540px]" aria-hidden="true" />
      <div ref={overlay} className="pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute top-3 left-3 rounded-sm bg-void/70 px-3 py-2 font-mono text-[10px] tracking-[0.2em] text-ink-2 uppercase backdrop-blur-sm">
        Sector Kestrel · {players} pilot{players === 1 ? "" : "s"}
      </div>
      {me && (
        <dl className="pointer-events-none absolute top-3 right-3 grid grid-cols-3 gap-x-4 gap-y-1 rounded-sm bg-void/70 px-3 py-2 font-mono text-[11px] backdrop-blur-sm sm:grid-cols-6">
          {HUD.map(([id, name]) => (
            <div key={id}>
              <dt className="text-[9px] tracking-widest text-ink-3 uppercase">{name}</dt>
              <dd className="font-bold text-ink">{held.get(id) ?? 0}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] rounded-sm bg-void/70 px-3 py-2 text-xs text-ink-2 backdrop-blur-sm">
        {failed
          ? "This browser has no WebGL: play from the panel below."
          : belt
            ? held.has(belt.ship)
              ? `Click to mine the ${belt.name.toLowerCase()}: ${belt.ore}`
              : `The ${belt.name.toLowerCase()} needs ${belt.needs}`
            : me
              ? "Click a belt to mine it · drag to look around · scroll to zoom"
              : "Join below to fly in this sector"}
      </p>
      <p className="pointer-events-none absolute right-3 bottom-3 hidden rounded-sm bg-void/70 px-3 py-2 font-mono text-[10px] text-ink-3 backdrop-blur-sm sm:block">
        {live ? "every move decided by the sealed Zig core" : "running in your browser, out of the escrow"}
      </p>
    </div>
  );
}
