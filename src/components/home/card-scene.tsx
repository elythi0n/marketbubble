"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import QRCode from "qrcode";

import { LOGO_PATHS } from "@/components/dashboard/market-bubble-logo";
import { getSiteUrl } from "@/lib/site";
import { useTheme } from "@/lib/theme/theme-context";

export interface DragState {
  target: number;
  vel: number;
  dragging: boolean;
  lastX: number;
  lastInteract: number;
}

/** Per-theme card stock: warm cream in light, cool near-white in dark. */
interface CardStyle {
  paper: string;
  tint: string;
  ink: string;
}
const STYLES: Record<"light" | "dark", CardStyle> = {
  light: { paper: "/textures/paper-white.png", tint: "#f1ead8", ink: "#39433f" },
  dark: { paper: "/textures/paper-cool.png", tint: "#eef0f2", ink: "#363b40" },
};

/* ---- textures ---------------------------------------------------- */

function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  for (let i = 0; i < (w * h) / 320; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

/** Canvas texture with a tiled paper photo base + a draw callback; `render()` recomposites. */
function paperTexture(w: number, h: number, paperSrc: string, tint: string, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let paper: HTMLImageElement | null = null;
  const render = () => {
    ctx.clearRect(0, 0, w, h);
    if (paper) {
      const pat = ctx.createPattern(paper, "repeat");
      ctx.fillStyle = pat ?? tint;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
    }
    paperGrain(ctx, w, h);
    draw(ctx);
    tex.needsUpdate = true;
  };
  render();
  const img = new Image();
  img.onload = () => {
    paper = img;
    render();
  };
  img.src = paperSrc;
  return { texture: tex, render };
}

function loadImg(src: string, onload: (img: HTMLImageElement) => void) {
  const img = new Image();
  img.onload = () => onload(img);
  img.src = src;
}

/** MarketBubble lettermark as an image, tinted to the card ink. */
function loadLogo(ink: string, onload: (img: HTMLImageElement) => void) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400' fill='${ink}'>${LOGO_PATHS.map(
    (d) => `<path d='${d}'/>`,
  ).join("")}</svg>`;
  loadImg(`data:image/svg+xml;utf8,${svg.replace(/#/g, "%23").replace(/"/g, "'")}`, onload);
}

const POLY_RATIO = 53.01 / 233.46;

function cardFrontTexture(style: CardStyle): THREE.Texture {
  const W = 1024;
  const H = 602;
  let logo: HTMLImageElement | null = null;
  let poly: HTMLImageElement | null = null;
  const { texture, render } = paperTexture(W, H, style.paper, style.tint, (ctx) => {
    ctx.fillStyle = style.ink;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "600 26px Georgia, 'Times New Roman', serif";
    ["Make Money", "Command Attention", "Leverage AI"].forEach((t, i) => ctx.fillText(t, 72, 76 + i * 38));
    ctx.textAlign = "right";
    ctx.font = "italic 28px Georgia, serif";
    ctx.fillText("“Invest in Yourself”", W - 72, 80);
    ctx.textAlign = "left";
    ctx.font = "500 24px Georgia, serif";
    ctx.fillText("LIVE ON TWITCH", 72, H - 104);
    ctx.font = "700 34px Georgia, serif";
    ctx.fillText("THURSDAY 1PM PST", 72, H - 74);

    // presented by + the real Polymarket logo, bottom-right
    const lw = 150;
    const lh = lw * POLY_RATIO;
    const lx = W - 72 - lw;
    const ly = H - 72;
    if (poly) ctx.drawImage(poly, lx, ly - lh / 2, lw, lh);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "500 22px Georgia, serif";
    ctx.fillText("PRESENTED BY", lx - 14, ly);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    if (logo) ctx.drawImage(logo, W / 2 - 185, H / 2 - 195, 370, 370);
  });
  loadLogo(style.ink, (img) => {
    logo = img;
    render();
  });
  loadImg("/polymarket.svg", (img) => {
    poly = img;
    render();
  });
  return texture;
}

function cardBackTexture(style: CardStyle, schedule: string): THREE.Texture {
  const W = 1024;
  const H = 602;
  let qr: HTMLCanvasElement | null = null;
  let logo: HTMLImageElement | null = null;
  const panel = 388;
  const px = W / 2 - panel / 2;
  const py = H / 2 - panel / 2 + 8;

  const { texture, render } = paperTexture(W, H, style.paper, style.tint, (ctx) => {
    ctx.fillStyle = style.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "600 27px Georgia, 'Times New Roman', serif";
    ctx.fillText("YOU HAVE BEEN INVITED", W / 2, 56);

    if (qr) ctx.drawImage(qr, px, py, panel, panel);
    if (logo) {
      const s = 74;
      ctx.fillStyle = style.tint;
      ctx.beginPath();
      ctx.roundRect(W / 2 - s / 2 - 11, py + panel / 2 - s / 2 - 11, s + 22, s + 22, 14);
      ctx.fill();
      ctx.drawImage(logo, W / 2 - s / 2, py + panel / 2 - s / 2, s, s);
    }

    ctx.fillStyle = style.ink;
    ctx.font = "600 24px Georgia, serif";
    ctx.fillText(schedule, W / 2, H - 70);
  });

  const qrCanvas = document.createElement("canvas");
  QRCode.toCanvas(
    qrCanvas,
    `${getSiteUrl()}/watch`,
    { errorCorrectionLevel: "H", margin: 0, width: panel, color: { dark: style.ink, light: "#00000000" } },
    (err) => {
      if (!err) {
        qr = qrCanvas;
        render();
      }
    },
  );
  loadLogo(style.ink, (img) => {
    logo = img;
    render();
  });
  return texture;
}

/* ---- card -------------------------------------------------------- */

function FlipCard({ drag, theme, schedule }: { drag: RefObject<DragState>; theme: "light" | "dark"; schedule: string }) {
  const group = useRef<THREE.Group>(null);
  const front = useMemo(() => cardFrontTexture(STYLES[theme]), [theme]);
  const back = useMemo(() => cardBackTexture(STYLES[theme], schedule), [theme, schedule]);
  const cur = useRef(0);

  // release GPU memory when the theme swaps the textures (or on unmount)
  useEffect(() => () => {
    front.dispose();
    back.dispose();
  }, [front, back]);

  useFrame((s, dt) => {
    const g = group.current;
    const d = drag.current;
    if (!g || !d) return;
    const t = s.clock.elapsedTime;
    if (d.dragging) {
      d.lastInteract = t;
    } else {
      d.target += d.vel;
      d.vel *= 0.92;
      if (t - d.lastInteract > 3.5) d.target += 0.16 * dt;
    }
    cur.current += (d.target - cur.current) * Math.min(1, dt * 7);
    g.rotation.y = cur.current;
    g.rotation.x = -0.08 + Math.sin(t * 0.7) * 0.025;
    g.position.y = Math.sin(t * 0.9) * 0.05;
  });

  const edge = theme === "dark" ? "#dfe1e4" : "#ece4d2";
  return (
    <group ref={group}>
      <mesh castShadow>
        <boxGeometry args={[3.4, 2.0, 0.05]} />
        <meshStandardMaterial color={edge} roughness={0.82} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0, 0.027]}>
        <planeGeometry args={[3.36, 1.96]} />
        <meshStandardMaterial map={front} roughness={0.78} />
      </mesh>
      <mesh position={[0, 0, -0.027]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[3.36, 1.96]} />
        <meshStandardMaterial map={back} roughness={0.78} />
      </mesh>
    </group>
  );
}

export function CardScene({ drag, schedule }: { drag: RefObject<DragState>; schedule: string }) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0.3, 6], fov: 32 }}>
      <ambientLight intensity={0.8} color="#fff4e6" />
      <directionalLight position={[3, 4, 5]} intensity={1.15} color="#ffffff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
      <directionalLight position={[-4, 1.5, 2]} intensity={0.4} color="#dfe6ff" />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={1.6} position={[0, 3, 4]} scale={[7, 7, 1]} color="#fff3df" />
        <Lightformer intensity={0.5} position={[-5, 1, 2]} scale={[4, 4, 1]} color="#aebbe0" />
      </Environment>
      <FlipCard drag={drag} theme={theme} schedule={schedule} />
      <ContactShadows position={[0, -1.4, 0]} opacity={0.32} scale={9} blur={2.8} far={4} color="#1a140c" />
    </Canvas>
  );
}

export default CardScene;
