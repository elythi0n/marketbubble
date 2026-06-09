"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  /** @deprecated Kept for Magic UI API compat; direction is always from → to along the path. */
  reverse?: boolean;
  duration?: number;
  delay?: number;
  repeat?: number;
  repeatDelay?: number;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
  /** Extra length along the straight chord. Keep 0 when beams must land exactly on node centers. */
  pathLengthExtend?: number;
}

/**
 * Dim track + bright segment that travels along the path (from → to).
 * Dash motion uses the Web Animations API on the path element — reliable in Chrome (SVG SMIL is unreliable/removed).
 * @see https://magicui.design/docs/components/animated-beam
 */
export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  duration = 3,
  delay = 0,
  repeat: _repeat = Number.POSITIVE_INFINITY,
  repeatDelay = 0,
  pathColor = "rgb(148 163 184)",
  pathWidth = 2,
  pathOpacity = 0.22,
  gradientStartColor = "#5b8cff",
  gradientStopColor = "#ecfdf5",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
  pathLengthExtend = 0,
}: AnimatedBeamProps) {
  const rawId = useId();
  const gradientId = `beam-${rawId.replace(/:/g, "")}`;
  const beamPathRef = useRef<SVGPathElement>(null);
  const [pathD, setPathD] = useState("");
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [pathEnds, setPathEnds] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });

  useEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const from = fromRef.current;
      const to = toRef.current;
      if (!container || !from || !to) return;

      const cr = container.getBoundingClientRect();
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();

      let startX = fr.left - cr.left + fr.width / 2 + startXOffset;
      let startY = fr.top - cr.top + fr.height / 2 + startYOffset;
      let endX = tr.left - cr.left + tr.width / 2 + endXOffset;
      let endY = tr.top - cr.top + tr.height / 2 + endYOffset;

      const dx = endX - startX;
      const dy = endY - startY;
      const chord = Math.hypot(dx, dy) || 1;
      const ux = dx / chord;
      const uy = dy / chord;
      /** Half of pathLengthExtend applied at each end along the chord (total +pathLengthExtend on length). */
      const extendEach = (pathLengthExtend / 2) * chord;
      startX -= ux * extendEach;
      startY -= uy * extendEach;
      endX += ux * extendEach;
      endY += uy * extendEach;

      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2 + curvature;
      setPathD(`M ${startX},${startY} Q ${midX},${midY} ${endX},${endY}`);
      setPathEnds({ x1: startX, y1: startY, x2: endX, y2: endY });
      setSvgSize({ width: cr.width, height: cr.height });
    };

    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    if (fromRef.current) ro.observe(fromRef.current);
    if (toRef.current) ro.observe(toRef.current);
    window.addEventListener("resize", update);
    // No scroll listener: from/to positions relative to container are unchanged under page scroll;
    // updating here restarted the dash animation constantly and caused visible hitches.
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
    pathLengthExtend,
  ]);

  useEffect(() => {
    const el = beamPathRef.current;
    if (!el || !pathD) return;

    const cycle = duration + repeatDelay;
    const moveEnd = cycle > 0 ? duration / cycle : 1;

    const keyframes =
      repeatDelay > 0
        ? [
            { strokeDashoffset: 0, offset: 0 },
            { strokeDashoffset: -1, offset: moveEnd },
            { strokeDashoffset: -1, offset: 1 },
          ]
        : [
            { strokeDashoffset: 0 },
            { strokeDashoffset: -1 },
          ];

    const animation = el.animate(keyframes as Keyframe[], {
      duration: (repeatDelay > 0 ? cycle : duration) * 1000,
      iterations: Infinity,
      easing: "linear",
      delay: delay * 1000,
      fill: "both",
    });

    return () => animation.cancel();
  }, [pathD, duration, delay, repeatDelay]);

  const dashSegment = 0.16;
  const dashGap = 1 - dashSegment;

  const dx = pathEnds.x2 - pathEnds.x1;
  const dy = pathEnds.y2 - pathEnds.y1;
  const gradientDegenerate = dx * dx + dy * dy < 4;

  void _repeat;

  return (
    <svg
      fill="none"
      width={svgSize.width}
      height={svgSize.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("pointer-events-none absolute left-0 top-0 z-0 select-none", className)}
      viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
    >
      <title>Connection</title>
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      <path
        ref={beamPathRef}
        d={pathD}
        fill="none"
        pathLength={1}
        stroke={`url(#${gradientId})`}
        strokeWidth={pathWidth + 0.85}
        strokeLinecap="round"
        strokeDasharray={`${dashSegment} ${dashGap}`}
        strokeDashoffset={0}
      />
      <defs>
        {gradientDegenerate ? (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradientStartColor} stopOpacity="0.2" />
            <stop offset="50%" stopColor={gradientStopColor} stopOpacity="1" />
            <stop offset="100%" stopColor={gradientStartColor} stopOpacity="0.2" />
          </linearGradient>
        ) : (
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={pathEnds.x1}
            y1={pathEnds.y1}
            x2={pathEnds.x2}
            y2={pathEnds.y2}
          >
            <stop offset="0%" stopColor={gradientStartColor} stopOpacity="0.2" />
            <stop offset="50%" stopColor={gradientStopColor} stopOpacity="1" />
            <stop offset="100%" stopColor={gradientStartColor} stopOpacity="0.2" />
          </linearGradient>
        )}
      </defs>
    </svg>
  );
}
