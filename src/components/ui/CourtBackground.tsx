"use client";

import { useEffect, useRef } from "react";

// ── Perspective projection ────────────────────────────────────────────────────
//
// Maps court coordinates to canvas pixels.
//   t  0→1 : near baseline → far baseline (depth)
//   s -1→1 : left doubles sideline → right doubles sideline (lateral)
//
// Vanishing point sits near the top-centre of the canvas.
// Near baseline bleeds beyond the canvas edges for an immersive "on-court" feel.

function project(t: number, s: number, W: number, H: number) {
  const vpY    = H * 0.08;   // vanishing point
  const nearY  = H * 0.96;   // near baseline (slightly off bottom edge)
  const nearHW = W * 0.62;   // half-width at near baseline — wider than canvas

  const y     = nearY + (vpY - nearY) * t;
  const halfW = nearHW * (1 - t);
  const x     = W / 2 + s * halfW;
  return { x, y };
}

// ── Court line definitions ────────────────────────────────────────────────────
//
// Real proportions (full court, 23.77 m):
//   Net          t = 0.50
//   Service line t = 0.23  (near)  /  0.77  (far)
//   Singles s    ± 0.75   (8.23 m of 10.97 m doubles width)

const LINES: [number, number, number, number][] = [
  // Baselines
  [0,     -1,     0,     1    ],
  [1,     -1,     1,     1    ],
  // Doubles sidelines
  [0,     -1,     1,    -1    ],
  [0,      1,     1,     1    ],
  // Singles sidelines
  [0,     -0.75,  1,    -0.75 ],
  [0,      0.75,  1,     0.75 ],
  // Net
  [0.5,   -1,     0.5,   1    ],
  // Service lines
  [0.23,  -0.75,  0.23,  0.75 ],
  [0.77,  -0.75,  0.77,  0.75 ],
  // Centre service lines
  [0.23,   0,     0.5,   0    ],
  [0.5,    0,     0.77,  0    ],
  // Centre marks
  [0,     -0.03,  0,     0.03 ],
  [1,     -0.03,  1,     0.03 ],
];

// Net posts (vertical stubs — drawn separately at a different opacity)
const NET_POSTS: [number, number, number, number][] = [
  [0.48, -1, 0.52, -1],
  [0.48,  1, 0.52,  1],
];

// ── Sweep opacity envelope ────────────────────────────────────────────────────
// Fades in at the near end and out at the far end so the loop is seamless.

function sweepAlpha(t: number): number {
  const fadeZone = 0.06;
  if (t < fadeZone)       return t / fadeZone;
  if (t > 1 - fadeZone)   return (1 - t) / fadeZone;
  return 1;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CourtBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let sweepT = 0; // 0 = near baseline, travels toward 1 = far baseline

    // Base sweep speed — full traverse in ~5 s at 60 fps
    const BASE_SPEED = 1 / (60 * 5);
    let currentSpeed = BASE_SPEED;
    const TARGET_SPEED = { value: BASE_SPEED };

    // ── Resize ──────────────────────────────────────────────────────────────

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    // ── Pointer: speeds up sweep while cursor is over canvas ─────────────────

    function onMouseEnter() { TARGET_SPEED.value = BASE_SPEED * 2.2; }
    function onMouseLeave() { TARGET_SPEED.value = BASE_SPEED; }

    // ── Render ───────────────────────────────────────────────────────────────

    function render() {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);

      // ── 1. Court lines ──────────────────────────────────────────────────

      ctx.lineWidth   = 0.8;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";

      for (const [t0, s0, t1, s1] of LINES) {
        const a = project(t0, s0, W, H);
        const b = project(t1, s1, W, H);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Net posts slightly brighter
      ctx.lineWidth   = 1.2;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      for (const [t0, s0, t1, s1] of NET_POSTS) {
        const a = project(t0, s0, W, H);
        const b = project(t1, s1, W, H);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // ── 2. Sweep band ───────────────────────────────────────────────────

      const left  = project(sweepT, -1, W, H);
      const right = project(sweepT,  1, W, H);
      const sweepY = left.y;
      const envelope = sweepAlpha(sweepT);

      // Band height scales with depth (larger near the viewer, thinner far)
      const bandH = Math.max(2, H * 0.035 * (1 - sweepT * 0.6));

      const grad = ctx.createLinearGradient(0, sweepY - bandH, 0, sweepY + bandH);
      grad.addColorStop(0,    `rgba(255,255,255,0)`);
      grad.addColorStop(0.35, `rgba(255,255,255,${(0.07  * envelope).toFixed(3)})`);
      grad.addColorStop(0.5,  `rgba(255,255,255,${(0.22  * envelope).toFixed(3)})`);
      grad.addColorStop(0.65, `rgba(255,255,255,${(0.07  * envelope).toFixed(3)})`);
      grad.addColorStop(1,    `rgba(255,255,255,0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(left.x, sweepY - bandH, right.x - left.x, bandH * 2);

      // Thin bright leading edge line
      ctx.beginPath();
      ctx.moveTo(left.x,  sweepY);
      ctx.lineTo(right.x, sweepY);
      ctx.strokeStyle = `rgba(255,255,255,${(0.30 * envelope).toFixed(3)})`;
      ctx.lineWidth   = 0.6;
      ctx.stroke();

      // ── 3. Advance sweep ────────────────────────────────────────────────

      // Ease speed toward target
      currentSpeed += (TARGET_SPEED.value - currentSpeed) * 0.05;
      sweepT += currentSpeed;
      if (sweepT > 1) sweepT = 0;

      rafId = requestAnimationFrame(render);
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    resize();

    canvas.addEventListener("mouseenter", onMouseEnter);
    canvas.addEventListener("mouseleave", onMouseLeave);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("mouseenter", onMouseEnter);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-full w-full"
    />
  );
}
