"use client";

import { useEffect, useRef } from "react";

import { useTheme } from "@/lib/theme/theme-context";
import { cn } from "@/lib/utils";

/**
 * A self-contained WebGL2 dithered-vortex orb (in the spirit of cult-ui's hero-dithering, but with
 * no dependency). A rotating multi-arm spiral is thresholded through an 8×8 Bayer matrix to get the
 * ordered-dither "pixel" look, rendered in two theme-aware colors over a transparent disc so it sits
 * on either the paper or graphite card. Animation pauses when off-screen / tab-hidden, and falls
 * back to a single static frame when motion is disabled. Degrades to a CSS gradient if WebGL2 is
 * unavailable.
 */
const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_back;
uniform vec3 u_front;
uniform float u_px;

// Compact 8x8 Bayer ordered-dither threshold (0..1), the classic bit-interleave form.
float bayer8(ivec2 p) {
  int x = p.x & 7;
  int y = p.y & 7;
  int xc = x ^ y;
  int v = 0;
  v |= ((xc >> 2) & 1) << 0;
  v |= ((y  >> 2) & 1) << 1;
  v |= ((xc >> 1) & 1) << 2;
  v |= ((y  >> 1) & 1) << 3;
  v |= ((xc >> 0) & 1) << 4;
  v |= ((y  >> 0) & 1) << 5;
  return float(v) / 64.0;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * u_res) / min(u_res.x, u_res.y);
  float r = length(uv) * 2.0;            // ~0 at center, ~1 at the inscribed edge
  float ang = atan(uv.y, uv.x);

  // Rotating three-arm spiral, with a second slower counter-rotating arm for depth.
  float spiral = sin(ang * 3.0 + r * 6.2832 - u_time * 0.7);
  spiral += 0.5 * sin(ang * 2.0 - r * 4.0 + u_time * 0.45);
  float v = 0.5 + 0.45 * spiral;

  v *= smoothstep(0.02, 0.46, r);        // dark vortex hole in the middle
  v *= 1.0 - smoothstep(0.80, 1.0, r);   // soften toward the rim

  ivec2 cell = ivec2(floor(frag / u_px));
  float on = step(bayer8(cell), v);
  vec3 col = mix(u_back, u_front, on);

  float alpha = 1.0 - smoothstep(0.97, 1.01, r); // circular disc
  fragColor = vec4(col, alpha);
}`;

type RGB = [number, number, number];
// The "dark" cells of the dither use the exact theme background so the swirl's dark areas melt into
// the surface and only the blue dithering reads. Graphite #141416 on dark, warm paper #f1ede2 on light.
const PALETTE: Record<"light" | "dark", { back: RGB; front: RGB }> = {
  dark: { back: [20, 20, 22], front: [40, 182, 244] },
  light: { back: [241, 237, 226], front: [31, 140, 224] },
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function DitherHero({
  className,
  animate = true,
  /** Dither cell size in CSS px — smaller = finer dots (use a lower value for small orbs). */
  pxSize = 2.4,
}: {
  className?: string;
  animate?: boolean;
  pxSize?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  // Read latest animate/theme/pxSize inside the rAF loop without re-initializing WebGL.
  const animateRef = useRef(animate);
  animateRef.current = animate;
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;
  const pxRef = useRef(pxSize);
  pxRef.current = pxSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      canvas.dataset.fallback = "1"; // CSS gradient takes over (see markup)
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uBack = gl.getUniformLocation(prog, "u_back");
    const uFront = gl.getUniformLocation(prog, "u_front");
    const uPx = gl.getUniformLocation(prog, "u_px");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let visible = true;
    let t = 0;
    let last = 0;
    const draw = (now: number) => {
      const moving = animateRef.current && !reduced;
      if (last) t += (now - last) * (moving ? 1 : 0);
      last = now;
      const pal = PALETTE[themeRef.current];
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t / 1000);
      gl.uniform3f(uBack, pal.back[0] / 255, pal.back[1] / 255, pal.back[2] / 255);
      gl.uniform3f(uFront, pal.front[0] / 255, pal.front[1] / 255, pal.front[2] / 255);
      gl.uniform1f(uPx, Math.max(2, dpr * pxRef.current));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Static themes (motion off / reduced): one frame is enough; keep ticking only when moving.
      if (moving && visible) raf = requestAnimationFrame(draw);
      else raf = 0;
    };
    const start = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(draw);
      }
    };

    // Pause when scrolled out of view or the tab is hidden; always render at least one frame.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    const onVis = () => {
      visible = !document.hidden;
      if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);

    start();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <div className={cn("relative aspect-square", className)}>
      {/* WebGL canvas (primary). The CSS gradient under it shows only if WebGL2 is unavailable. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,var(--feed-link),transparent_70%)] opacity-60"
      />
      <canvas ref={canvasRef} className="relative size-full" aria-hidden />
    </div>
  );
}
