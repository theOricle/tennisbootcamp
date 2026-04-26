"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// ── Particle wave background ──────────────────────────────────────────────────
//
// Faithful port of the Three.js "particles waves" CodePen (deathfang/WxNVoq).
// Same grid size, separation, wave math and camera-follow-mouse behaviour.
// Modernised: uses BufferGeometry + Points + a tiny shader instead of the
// deprecated CanvasRenderer + THREE.Particle pipeline.

const SEPARATION = 100;
const AMOUNTX    = 100;
const AMOUNTY    = 70;

export function CourtBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let W = container.clientWidth;
    let H = container.clientHeight;
    let halfW = W / 2;
    let halfH = H / 2;

    // Initial mouse offset matches the original (slightly tilted view)
    let mouseX = 85;
    let mouseY = -342;
    let count  = 0;

    // ── Camera & scene ────────────────────────────────────────────────────

    const camera = new THREE.PerspectiveCamera(120, W / H, 1, 10000);
    camera.position.z = 1000;
    camera.position.y = 350;  // elevate camera so we look DOWN at the wave plane

    const scene = new THREE.Scene();

    // ── Particle geometry ─────────────────────────────────────────────────

    const NUM = AMOUNTX * AMOUNTY;
    const positions = new Float32Array(NUM * 3);
    const scales    = new Float32Array(NUM);

    {
      let i = 0;
      let j = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          positions[i    ] = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
          positions[i + 1] = 0;
          positions[i + 2] = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;
          scales[j] = 1;
          i += 3;
          j += 1;
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("scale",    new THREE.BufferAttribute(scales,    1));

    // Tiny shader — circular point sprites at per-vertex sizes.
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xe1e1e1) },
      },
      vertexShader: `
        attribute float scale;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize    = scale * (300.0 / -mvPosition.z);
          gl_Position     = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          if (length(c) > 0.5) discard;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ── Renderer ──────────────────────────────────────────────────────────

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0); // transparent — Hero's #061427 shows through
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width   = "100%";
    renderer.domElement.style.height  = "100%";
    container.appendChild(renderer.domElement);

    // ── Pointer + resize ──────────────────────────────────────────────────

    // Listen on window (not container) so overlay divs don't eat the events.
    function onMouseMove(e: MouseEvent) {
      const rect = container.getBoundingClientRect();
      // Only react when cursor is over the hero
      if (
        e.clientX < rect.left  || e.clientX > rect.right ||
        e.clientY < rect.top   || e.clientY > rect.bottom
      ) {
        return;
      }
      mouseX = ((e.clientX - rect.left) - halfW) * 1.0;
      mouseY = ((e.clientY - rect.top)  - halfH) * 1.0;
    }

    function onResize() {
      W = container.clientWidth;
      H = container.clientHeight;
      halfW = W / 2;
      halfH = H / 2;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    }

    window.addEventListener("mousemove", onMouseMove);
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // ── Animation loop ────────────────────────────────────────────────────

    let rafId = 0;

    function animate() {
      // Camera follows mouse horizontally only — vertical axis locked
      camera.position.x += (mouseX - camera.position.x) * 0.06;
      // camera.position.y stays at its initial value
      camera.lookAt(scene.position);

      const posAttr   = geometry.attributes.position as THREE.BufferAttribute;
      const scaleAttr = geometry.attributes.scale    as THREE.BufferAttribute;
      const pos       = posAttr.array   as Float32Array;
      const sca       = scaleAttr.array as Float32Array;

      let i = 0;
      let j = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          pos[i + 1] =
            Math.sin((ix + count) * 0.3) * 50 +
            Math.sin((iy + count) * 0.5) * 50;
          sca[j] =
            (Math.sin((ix + count) * 0.3) + 1) * 5.5 +
            (Math.sin((iy + count) * 0.5) + 1) * 5.5;
          i += 3;
          j += 1;
        }
      }

      posAttr.needsUpdate   = true;
      scaleAttr.needsUpdate = true;

      renderer.render(scene, camera);
      count += 0.1;
      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);

    // ── Cleanup ───────────────────────────────────────────────────────────

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
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
      className="block h-full w-full"
    />
  );
}
