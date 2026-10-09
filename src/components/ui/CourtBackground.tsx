"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// The owner-locked particle wave (DECISIONS 2026-04-25). The grid spans the
// same world extent at every size; phones sample it with half the points.
const SEPARATION = 120;
const AMOUNTX    = 50;
const AMOUNTY    = 35;
const AMOUNTX_SMALL = 35;
const AMOUNTY_SMALL = 25;

/**
 * Audit M15: the loop runs only while the hero is on screen, the tab is
 * visible and the visitor has not asked for reduced motion. Under
 * prefers-reduced-motion the wave renders one still frame and never moves.
 */
export function CourtBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const c: HTMLDivElement = container;

    const small = window.innerWidth < 768;
    const NX = small ? AMOUNTX_SMALL : AMOUNTX;
    const NY = small ? AMOUNTY_SMALL : AMOUNTY;
    // World units between points, and the index step that keeps the wave's
    // shape identical when fewer points sample it.
    const SEP_X = (SEPARATION * AMOUNTX) / NX;
    const SEP_Z = (SEPARATION * AMOUNTY) / NY;
    const STEP_X = AMOUNTX / NX;
    const STEP_Y = AMOUNTY / NY;

    let W = c.clientWidth;
    let H = c.clientHeight;
    let halfW = W / 2;

    let mouseX = 85;
    let count  = 0;

    // Normalised cursor (-1..1 across the hero), used for per-particle bounce.
    let nmx = 0;
    let nmy = 0;
    let cursorActive = false;

    const camera = new THREE.PerspectiveCamera(120, W / H, 1, 10000);
    camera.position.z = 1000;
    camera.position.y = 350;

    const scene = new THREE.Scene();

    const NUM = NX * NY;
    const positions = new Float32Array(NUM * 3);
    const scales    = new Float32Array(NUM);

    {
      let i = 0;
      let j = 0;
      for (let ix = 0; ix < NX; ix++) {
        for (let iy = 0; iy < NY; iy++) {
          positions[i    ] = ix * SEP_X - (NX * SEP_X) / 2;
          positions[i + 1] = 0;
          positions[i + 2] = iy * SEP_Z - (NY * SEP_Z) / 2;
          scales[j] = 1;
          i += 3;
          j += 1;
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("scale",    new THREE.BufferAttribute(scales,    1));

    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xe1e1e1) } },
      vertexShader: [
        "attribute float scale;",
        "void main() {",
        "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
        "  gl_PointSize    = scale * (300.0 / -mvPosition.z);",
        "  gl_Position     = projectionMatrix * mvPosition;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 color;",
        "void main() {",
        "  vec2 c = gl_PointCoord - vec2(0.5);",
        "  if (length(c) > 0.5) discard;",
        "  gl_FragColor = vec4(color, 1.0);",
        "}"
      ].join("\n"),
      transparent: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // No antialiasing and a 1.5 pixel-ratio cap: round point sprites gain
    // nothing from MSAA, and DPR 2 doubled the fill cost (audit M15).
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width   = "100%";
    renderer.domElement.style.height  = "100%";
    c.appendChild(renderer.domElement);

    function onMouseMove(e: MouseEvent) {
      const rect = c.getBoundingClientRect();
      if (
        e.clientX < rect.left  || e.clientX > rect.right ||
        e.clientY < rect.top   || e.clientY > rect.bottom
      ) {
        cursorActive = false;
        return;
      }
      const rx = (e.clientX - rect.left) - halfW;
      const ry = (e.clientY - rect.top)  - rect.height / 2;
      mouseX = rx;
      nmx = rx / (rect.width  / 2);
      nmy = ry / (rect.height / 2);
      cursorActive = true;
    }

    /** Advance the wave to `count` and draw it once. */
    function drawFrame() {
      // Slight camera follow — half the previous amplitude (subtler rotation)
      camera.position.x += ((mouseX * 0.5) - camera.position.x) * 0.06;
      camera.lookAt(scene.position);

      const posAttr   = geometry.attributes.position as unknown as { array: Float32Array; needsUpdate: boolean };
      const scaleAttr = geometry.attributes.scale    as unknown as { array: Float32Array; needsUpdate: boolean };
      const pos       = posAttr.array;
      const sca       = scaleAttr.array;

      // Approximate cursor's world position projected onto the wave plane.
      const cursorWX = camera.position.x + nmx * 1400;
      const cursorWZ = nmy * 900;
      const RADIUS_SQ_INV = 1 / (300 * 300); // bounce decays past ~300 world units

      let i = 0;
      let j = 0;
      for (let ix = 0; ix < NX; ix++) {
        const fx = ix * STEP_X;
        for (let iy = 0; iy < NY; iy++) {
          const fy = iy * STEP_Y;
          // Base wave (unchanged)
          let y =
            Math.sin((fx + count) * 0.3) * 50 +
            Math.sin((fy + count) * 0.5) * 50;

          // Per-particle cursor bounce — gaussian-ish falloff
          if (cursorActive) {
            const dx = pos[i    ] - cursorWX;
            const dz = pos[i + 2] - cursorWZ;
            const d2 = (dx * dx + dz * dz) * RADIUS_SQ_INV;
            if (d2 < 6) {
              y += Math.exp(-d2) * 55 * Math.cos(count * 0.3);
            }
          }

          pos[i + 1] = y;
          sca[j] =
            (Math.sin((fx + count) * 0.3) + 1) * 5.5 +
            (Math.sin((fy + count) * 0.5) + 1) * 5.5;
          i += 3;
          j += 1;
        }
      }

      posAttr.needsUpdate   = true;
      scaleAttr.needsUpdate = true;

      renderer.render(scene, camera);
    }

    let rafId = 0;
    let running = false;
    let onScreen = true;
    let pageVisible = !document.hidden;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function loop() {
      drawFrame();
      count += 0.1;
      rafId = requestAnimationFrame(loop);
    }

    function sync() {
      const shouldRun = onScreen && pageVisible && !reducedMotion.matches;
      if (shouldRun && !running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    }

    function onResize() {
      W = c.clientWidth;
      H = c.clientHeight;
      halfW = W / 2;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
      // setSize clears the canvas; a paused or still wave redraws its frame.
      if (!running) drawFrame();
    }

    function onVisibilityChange() {
      pageVisible = !document.hidden;
      sync();
    }

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    io.observe(c);

    window.addEventListener("mousemove", onMouseMove);
    const ro = new ResizeObserver(onResize);
    ro.observe(c);
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.addEventListener("change", sync);

    // The first frame always draws, so reduced motion still shows the wave, still.
    drawFrame();
    const fadeId = requestAnimationFrame(() => {
      c.style.opacity = "1";
    });
    sync();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(fadeId);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotion.removeEventListener("change", sync);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      // Fades in once the first frame is drawn (instant under reduced motion).
      className="block h-full w-full opacity-0 transition-opacity duration-700"
    />
  );
}
