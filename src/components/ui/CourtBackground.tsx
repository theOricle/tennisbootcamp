"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const SEPARATION = 100;
const AMOUNTX    = 100;
const AMOUNTY    = 70;

export function CourtBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const c: HTMLDivElement = container;

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    function onResize() {
      W = c.clientWidth;
      H = c.clientHeight;
      halfW = W / 2;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    }

    window.addEventListener("mousemove", onMouseMove);
    const ro = new ResizeObserver(onResize);
    ro.observe(c);

    let rafId = 0;

    function animate() {
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
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          // Base wave (unchanged)
          let y =
            Math.sin((ix + count) * 0.3) * 50 +
            Math.sin((iy + count) * 0.5) * 50;

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
