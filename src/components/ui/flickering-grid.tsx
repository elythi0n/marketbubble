"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  maxOpacity?: number;
}

function parseRgb(color: string): { r: number; g: number; b: number } {
  const trimmed = color.trim();
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  const rgbSpace = trimmed.match(/rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)/i);
  if (rgbSpace) return { r: +rgbSpace[1], g: +rgbSpace[2], b: +rgbSpace[3] };
  return { r: 52, g: 211, b: 153 };
}

/**
 * Vendored from Magic UI Flickering Grid pattern (canvas + ResizeObserver).
 * @see https://magicui.design/docs/components/flickering-grid
 */
export function FlickeringGrid({
  squareSize = 4,
  gridGap = 6,
  flickerChance = 0.3,
  color = "rgb(0, 0, 0)",
  width: widthProp,
  height: heightProp,
  className,
  maxOpacity = 0.3,
  ...props
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const squaresRef = useRef<number[]>([]);
  const frameRef = useRef<number>(0);

  const rgb = useMemo(() => parseRgb(color), [color]);
  const cell = squareSize + gridGap;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const w = widthProp ?? rect.width;
      const h = heightProp ?? rect.height;
      setDimensions({ width: Math.max(0, w), height: Math.max(0, h) });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [widthProp, heightProp]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1, 2);
    const w = dimensions.width;
    const h = dimensions.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const total = cols * rows;

    if (squaresRef.current.length !== total) {
      squaresRef.current = Array.from({ length: total }, () => Math.random() * maxOpacity * 0.4);
    }

    const squares = squaresRef.current;
    for (let i = 0; i < total; i++) {
      if (Math.random() < flickerChance) {
        squares[i] = Math.random() * maxOpacity;
      }
    }

    ctx.clearRect(0, 0, w, h);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const opacity = squares[i] ?? 0;
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`;
        ctx.fillRect(col * cell, row * cell, squareSize, squareSize);
      }
    }
  }, [dimensions, cell, squareSize, rgb, flickerChance, maxOpacity]);

  useEffect(() => {
    const tick = () => {
      draw();
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  return (
    <div ref={containerRef} className={cn("relative h-full w-full overflow-hidden", className)} {...props}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}
