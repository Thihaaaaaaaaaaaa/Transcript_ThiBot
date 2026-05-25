// visualizer.js — 3D Audio Visualizer Engine
window.Visualizer = (function () {

  let canvas, ctx, analyser, dataArr, animId;
  let mode = 'bars';
  let W, H;
  let time = 0;

  const COLORS = {
    accent:  '#00e5ff',
    accent2: '#7c3aed',
    accent3: '#f59e0b',
    bg:      '#040608',
  };

  function init(canvasEl, analyserNode) {
    canvas = canvasEl;
    analyser = analyserNode;
    ctx = canvas.getContext('2d');

    if (analyser) {
      analyser.fftSize = 2048;
      dataArr = new Uint8Array(analyser.frequencyBinCount);
    }

    resize();
    window.addEventListener('resize', resize);
    startLoop();
  }

  function resize() {
    W = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    H = canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
  }

  function setMode(m) { mode = m; }

  function stopLoop() {
    if (animId) cancelAnimationFrame(animId);
  }

  function startLoop() {
    stopLoop();
    function frame() {
      time += 0.012;
      ctx.clearRect(0, 0, W, H);

      let freqData = null;
      if (analyser && dataArr) {
        analyser.getByteFrequencyData(dataArr);
        freqData = dataArr;
      }

      switch (mode) {
        case 'bars':   drawBars(freqData); break;
        case 'wave':   drawWave(freqData); break;
        case 'sphere': drawSphere(freqData); break;
        case 'radial': drawRadial(freqData); break;
        default:       drawBars(freqData);
      }

      animId = requestAnimationFrame(frame);
    }
    frame();
  }

  // ── Fake data generator for when no audio is playing ──
  function getFakeVal(i, total, t) {
    const base = Math.sin(i / total * Math.PI * 3 + t * 1.5) * 0.5 + 0.5;
    const noise = Math.sin(i * 0.3 + t * 3.7) * 0.15;
    const decay = Math.pow(1 - i / total, 0.6);
    return (base + noise) * decay * 0.4;
  }

  function getFreqValue(freqData, i, total) {
    if (freqData) {
      const idx = Math.floor(i / total * freqData.length * 0.75);
      return freqData[idx] / 255;
    }
    return getFakeVal(i, total, time);
  }

  // ── Mode: BARS ──────────────────────────────────────────────────
  function drawBars(freqData) {
    const count = 96;
    const barW = (W - count * 2) / count;
    const maxH = H * 0.72;
    const floor = H * 0.88;

    // Gradient background glow
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, 'rgba(0,229,255,0.02)');
    bg.addColorStop(0.5, 'rgba(124,58,237,0.02)');
    bg.addColorStop(1, 'rgba(245,158,11,0.02)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Floor line
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, floor); ctx.lineTo(W, floor);
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const val = getFreqValue(freqData, i, count);
      const bh = val * maxH;
      const x = i * (barW + 2) + 1;
      const y = floor - bh;

      // Hue shift across bars
      const hue = (i / count * 200 + time * 20) % 360;
      const grad = ctx.createLinearGradient(0, floor, 0, y);
      grad.addColorStop(0, `hsla(${hue},100%,60%,0.8)`);
      grad.addColorStop(1, `hsla(${hue + 40},100%,80%,0.3)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      roundRect(ctx, x, y, barW, bh, 2);
      ctx.fill();

      // Peak dot
      if (bh > 10) {
        ctx.beginPath();
        ctx.arc(x + barW / 2, y - 2, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},100%,90%,0.9)`;
        ctx.fill();
      }

      // Reflection
      const refGrad = ctx.createLinearGradient(0, floor, 0, floor + bh * 0.35);
      refGrad.addColorStop(0, `hsla(${hue},100%,60%,0.12)`);
      refGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = refGrad;
      ctx.beginPath();
      roundRect(ctx, x, floor, barW, bh * 0.35, 2);
      ctx.fill();
    }
  }

  // ── Mode: WAVE ──────────────────────────────────────────────────
  function drawWave(freqData) {
    const midY = H * 0.5;
    const amp = H * 0.38;
    const points = 512;

    let waveData = null;
    if (analyser && dataArr) {
      const td = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(td);
      waveData = td;
    }

    // Multiple wave layers
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const hue = layer * 60 + time * 25;
      const opacity = [0.7, 0.4, 0.2][layer];
      const layerAmp = amp * [1, 0.6, 0.35][layer];

      for (let i = 0; i < points; i++) {
        const x = (i / points) * W;
        let y;
        if (waveData) {
          const idx = Math.floor(i / points * waveData.length);
          y = midY + ((waveData[idx] / 128) - 1) * layerAmp * (1 - layer * 0.2);
        } else {
          const v = Math.sin(i / points * Math.PI * 6 + time * 2 + layer) * 0.5
                  + Math.sin(i / points * Math.PI * 14 + time * 3.5 - layer) * 0.3
                  + Math.sin(i / points * Math.PI * 3 + time * 1.2) * 0.2;
          y = midY + v * layerAmp;
        }
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }

      ctx.strokeStyle = `hsla(${hue},100%,65%,${opacity})`;
      ctx.lineWidth = [2.5, 1.5, 1][layer];
      ctx.shadowColor = `hsla(${hue},100%,65%,0.5)`;
      ctx.shadowBlur = [12, 6, 3][layer];
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Mode: SPHERE ────────────────────────────────────────────────
  function drawSphere(freqData) {
    const cx = W / 2, cy = H / 2;
    const baseR = Math.min(W, H) * 0.28;
    const spokes = 72;

    // Core glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.6);
    glow.addColorStop(0, 'rgba(0,229,255,0.12)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Base sphere wireframe
    ctx.strokeStyle = 'rgba(0,229,255,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      const r = baseR * (i / 5 * 0.8 + 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Frequency spokes
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2 - Math.PI / 2;
      const val = getFreqValue(freqData, i, spokes);
      const innerR = baseR * 0.35;
      const outerR = baseR * (0.35 + val * 1.3);
      const hue = (i / spokes * 360 + time * 30) % 360;

      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, `hsla(${hue},100%,65%,0.2)`);
      grad.addColorStop(1, `hsla(${hue},100%,80%,${0.4 + val * 0.5})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5 + val * 2;
      ctx.shadowColor = `hsla(${hue},100%,65%,0.6)`;
      ctx.shadowBlur = val * 15;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Center orb
    const orbGrad = ctx.createRadialGradient(cx - baseR * 0.08, cy - baseR * 0.08, 0, cx, cy, baseR * 0.32);
    orbGrad.addColorStop(0, 'rgba(200,255,255,0.8)');
    orbGrad.addColorStop(0.4, 'rgba(0,229,255,0.4)');
    orbGrad.addColorStop(1, 'rgba(0,229,255,0.05)');
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Rotating ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.5);
    ctx.strokeStyle = 'rgba(0,229,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.ellipse(0, 0, baseR * 1.15, baseR * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Mode: RADIAL ────────────────────────────────────────────────
  function drawRadial(freqData) {
    const cx = W / 2, cy = H / 2;
    const maxR = Math.min(W, H) * 0.42;
    const count = 128;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const val = getFreqValue(freqData, i, count);
      const innerR = maxR * 0.3;
      const outerR = innerR + val * maxR * 0.7;
      const hue = (i / count * 270 + time * 20) % 360;
      const alpha = 0.4 + val * 0.6;

      // Bar
      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;

      ctx.strokeStyle = `hsla(${hue},100%,65%,${alpha})`;
      ctx.lineWidth = 2 + val * 3;
      ctx.lineCap = 'round';
      ctx.shadowColor = `hsla(${hue},100%,65%,0.5)`;
      ctx.shadowBlur = val * 12;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';

    // Inner circle
    const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.3);
    ig.addColorStop(0, 'rgba(0,229,255,0.15)');
    ig.addColorStop(1, 'rgba(0,229,255,0.02)');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,229,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Idle animation (on upload card) ─────────────────────────────
  function idleAnimation(el) {
    const c = el;
    const x = c.getContext('2d');
    let t = 0;
    let aid;
    const W = c.width, H = c.height;

    function f() {
      t += 0.015;
      x.clearRect(0, 0, W, H);
      const count = 48;
      const cx = W / 2, cy = H / 2;
      const baseR = Math.min(W, H) * 0.38;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const v = (Math.sin(i * 0.4 + t * 2) * 0.5 + 0.5) * 0.5 + 0.1;
        const r1 = baseR * 0.35, r2 = baseR * (0.35 + v);
        const hue = (i / count * 200 + t * 25) % 360;
        x.strokeStyle = `hsla(${hue},100%,65%,0.5)`;
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        x.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        x.stroke();
      }

      // Core
      const ig = x.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.35);
      ig.addColorStop(0, 'rgba(0,229,255,0.2)');
      ig.addColorStop(1, 'rgba(0,229,255,0)');
      x.fillStyle = ig;
      x.beginPath(); x.arc(cx, cy, baseR * 0.35, 0, Math.PI * 2); x.fill();

      aid = requestAnimationFrame(f);
    }
    f();
    return () => cancelAnimationFrame(aid);
  }

  // ── Processing spinner ────────────────────────────────────────────
  function processingAnimation(el) {
    const c = el;
    const x = c.getContext('2d');
    let t = 0;
    let aid;
    const W = c.width, H = c.height;
    const cx = W / 2, cy = H / 2;

    function f() {
      t += 0.02;
      x.clearRect(0, 0, W, H);
      const rings = 5;

      for (let r = 0; r < rings; r++) {
        const radius = (r + 1) * (Math.min(W, H) / (rings * 2 + 2));
        const count = 24 + r * 12;
        const speed = (r % 2 === 0 ? 1 : -1) * (0.3 + r * 0.1);

        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + t * speed;
          const pulse = Math.sin(t * 3 + i * 0.5 + r) * 0.5 + 0.5;
          const dotR = 1.5 + pulse * 2;
          const hue = (i / count * 360 + t * 50) % 360;
          const alpha = 0.2 + pulse * 0.6;

          x.beginPath();
          x.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, dotR, 0, Math.PI * 2);
          x.fillStyle = `hsla(${hue},100%,70%,${alpha})`;
          x.fill();
        }
      }

      // Center pulse
      const pg = x.createRadialGradient(cx, cy, 0, cx, cy, 30);
      const pa = Math.sin(t * 2) * 0.3 + 0.4;
      pg.addColorStop(0, `rgba(0,229,255,${pa})`);
      pg.addColorStop(1, 'transparent');
      x.fillStyle = pg;
      x.beginPath(); x.arc(cx, cy, 30, 0, Math.PI * 2); x.fill();

      aid = requestAnimationFrame(f);
    }
    f();
    return () => cancelAnimationFrame(aid);
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    if (h < 0) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return { init, setMode, stopLoop, idleAnimation, processingAnimation };
})();
