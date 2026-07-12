import { useRef, useEffect } from 'react';

/* ============================================================
   ParticleGraph — a live, interactive constellation on <canvas>.

   A light field of particles drifts slowly across its container.
   On mousemove, nodes within MOUSE_RADIUS of the cursor smoothly
   accelerate toward it (velocity tracking + damping) and wire up
   with thin, glowing ruby lines — a visual metaphor for the
   KùzuDB graph engine resolving a match in real time.

   Extracted from Landing.jsx so it can be reused as an ambient
   background on any page. Pass `className` to position/style it
   (e.g. "absolute inset-0 z-0").

   Density is normalised centrally: the real particle count is
   derived from the canvas area (AREA_PER_NODE) so every page
   renders at the same light density regardless of viewport size.
   `nodeCount` is treated as an upper bound only, so the historical
   per-page overrides (100/120/150) all resolve to one uniform look.
   ============================================================ */
export default function ParticleGraph({
  className = 'absolute inset-0 w-full h-full',
  nodeCount = 90,
  connectDist = 160,
  mouseRadius = 250,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const CONNECT_DIST = connectDist; // faint ambient constellation links
    const MOUSE_RADIUS = mouseRadius; // attraction + glowing-network radius
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // ── uniform density ──
    const AREA_PER_NODE = 28000; // one node per ~28k px² → a light, clean field
    const MIN_NODES = 18;        // keep small containers from looking empty

    // ── velocity-tracking physics ──
    const DRIFT = 0.14;   // baseline ambient wander speed
    const ATTRACT = 0.28; // per-frame pull applied toward the cursor
    const DAMPING = 0.90; // decays the attraction impulse → smooth, non-sticky ease
    const MAX_PULL = 2.4; // ceiling on the tracking velocity so it never snaps

    let raf;
    let width = 0;
    let height = 0;
    const nodes = [];
    const mouse = { x: -9999, y: -9999, active: false };
    const rand = (min, max) => Math.random() * (max - min) + min;

    // Area-derived count, capped by the caller's nodeCount so every page
    // lands on the same visual density instead of its historical override.
    function targetCount() {
      const byArea = Math.round((width * height) / AREA_PER_NODE);
      return Math.max(MIN_NODES, Math.min(nodeCount, byArea));
    }

    function seed() {
      nodes.length = 0;
      const count = targetCount();
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          // dvx/dvy: constant ambient drift. ax/ay: cursor-tracking impulse
          // that eases in and decays each frame via DAMPING.
          dvx: rand(-DRIFT, DRIFT),
          dvy: rand(-DRIFT, DRIFT),
          ax: 0,
          ay: 0,
          r: rand(1.5, 3),
        });
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-seed on every resize so the field always fills the container,
      // even when it mounts at zero size and grows (e.g. flex children).
      seed();
    }

    function tick() {
      ctx.clearRect(0, 0, width, height);

      // ── advance physics (ambient drift + damped cursor tracking) ──
      for (const n of nodes) {
        if (mouse.active) {
          const dx = mouse.x - n.x;
          const dy = mouse.y - n.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < MOUSE_RADIUS) {
            // Pull eases with distance (stronger up close) and is added to the
            // tracking velocity rather than the position — so nodes accelerate
            // toward the cursor and coast, instead of teleporting.
            const pull = (1 - dist / MOUSE_RADIUS) * ATTRACT;
            n.ax += (dx / dist) * pull;
            n.ay += (dy / dist) * pull;
          }
        }

        // Damp the tracking impulse every frame: it builds smoothly while the
        // cursor is near and decays away once it leaves — never instant, never
        // sticky. The baseline drift is untouched, so the field keeps moving.
        n.ax *= DAMPING;
        n.ay *= DAMPING;
        const sp = Math.hypot(n.ax, n.ay);
        if (sp > MAX_PULL) { n.ax = (n.ax / sp) * MAX_PULL; n.ay = (n.ay / sp) * MAX_PULL; }

        n.x += n.dvx + n.ax;
        n.y += n.dvy + n.ay;

        // Reflect the ambient drift at the walls; the tracking impulse fades on
        // its own, so it needs no bounce handling.
        if (n.x < 0) { n.x = 0; n.dvx *= -1; }
        else if (n.x > width) { n.x = width; n.dvx *= -1; }
        if (n.y < 0) { n.y = 0; n.dvy *= -1; }
        else if (n.y > height) { n.y = height; n.dvy *= -1; }
      }

      // ── ambient constellation lines ──
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < CONNECT_DIST) {
            const alpha = ((1 - d / CONNECT_DIST) * 0.6).toFixed(2);
            ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // ── live ruby network around the cursor ──
      if (mouse.active) {
        const near = [];
        for (const n of nodes) {
          const d = Math.hypot(mouse.x - n.x, mouse.y - n.y);
          if (d < MOUSE_RADIUS) near.push({ n, d });
        }

        // node-to-node links inside the attraction field
        for (let i = 0; i < near.length; i++) {
          for (let j = i + 1; j < near.length; j++) {
            const a = near[i].n;
            const b = near[j].n;
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < MOUSE_RADIUS) {
              const alpha = (1 - d / MOUSE_RADIUS) * 0.5;
              ctx.strokeStyle = `rgba(255, 76, 76, ${alpha})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        // spokes from the cursor to each nearby node
        ctx.lineWidth = 1.2;
        for (const { n, d } of near) {
          const alpha = (1 - d / MOUSE_RADIUS) * 0.7;
          ctx.strokeStyle = `rgba(196, 30, 58, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      }

      // ── draw nodes (glowing when energised by the cursor) ──
      for (const n of nodes) {
        const energised =
          mouse.active && Math.hypot(mouse.x - n.x, mouse.y - n.y) < MOUSE_RADIUS;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (energised) {
          ctx.fillStyle = 'rgba(255, 76, 76, 0.95)';
          ctx.shadowColor = 'rgba(255, 76, 76, 0.9)';
          ctx.shadowBlur = 8;
        } else {
          ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(tick);
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      // Only treat the cursor as active while it is over the canvas region,
      // so a background instance doesn't light up from unrelated page areas.
      mouse.active =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
    }
    function onLeave() {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    tick();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
    };
  }, [nodeCount, connectDist, mouseRadius]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
