import { useRef, useEffect } from 'react';

/* ============================================================
   ParticleGraph — a live, interactive constellation on <canvas>.

   A dense field of particles drifts slowly across its container.
   On mousemove, any node within MOUSE_RADIUS of the cursor is
   pulled toward it and wired up with thin, glowing ruby lines —
   a visual metaphor for the KùzuDB graph engine resolving a
   match in real time.

   Extracted from Landing.jsx so it can be reused as an ambient
   background on any page. Pass `className` to position/style it
   (e.g. "absolute inset-0 z-0"), and optionally `nodeCount` /
   `connectDist` / `mouseRadius` to tune the density.
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

    const NODE_COUNT = nodeCount;
    const CONNECT_DIST = connectDist; // faint ambient constellation links
    const MOUSE_RADIUS = mouseRadius; // attraction + glowing-network radius
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let raf;
    let width = 0;
    let height = 0;
    const nodes = [];
    const mouse = { x: -9999, y: -9999, active: false };
    const rand = (min, max) => Math.random() * (max - min) + min;

    function seed() {
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: rand(-0.15, 0.15),
          vy: rand(-0.15, 0.15),
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

      // ── advance physics ──
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;

        if (mouse.active) {
          const dx = mouse.x - n.x;
          const dy = mouse.y - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MOUSE_RADIUS && dist > 0.1) {
            const force = (1 - dist / MOUSE_RADIUS) * 0.02;
            n.x += (dx / dist) * force;
            n.y += (dy / dist) * force;
          }
        }

        if (n.x < 0) { n.x = 0; n.vx *= -1; }
        else if (n.x > width) { n.x = width; n.vx *= -1; }
        if (n.y < 0) { n.y = 0; n.vy *= -1; }
        else if (n.y > height) { n.y = height; n.vy *= -1; }
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
