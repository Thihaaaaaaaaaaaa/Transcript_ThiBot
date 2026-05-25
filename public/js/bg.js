// bg.js — ambient particle field background
(function () {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');

  let W, H, particles = [], animId;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles(n = 80) {
    particles = [];
    for (let i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.2,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        opacity: Math.random() * 0.4 + 0.05,
      });
    }
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(0,229,255,0.025)';
    ctx.lineWidth = 1;
    const spacing = 80;
    for (let x = 0; x < W; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);

    // Subtle grid
    drawGrid();

    // Ambient glow
    const g1 = ctx.createRadialGradient(W * 0.15, H * 0.3, 0, W * 0.15, H * 0.3, W * 0.45);
    g1.addColorStop(0, 'rgba(0,229,255,0.025)');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(W * 0.85, H * 0.7, 0, W * 0.85, H * 0.7, W * 0.4);
    g2.addColorStop(0, 'rgba(124,58,237,0.03)');
    g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

    // Particles + connections
    particles.forEach((p, i) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,229,255,${p.opacity})`;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(0,229,255,${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    });

    animId = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { resize(); createParticles(); });
  resize();
  createParticles();
  frame();
})();
