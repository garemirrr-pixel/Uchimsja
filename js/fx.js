/* Visual + audio effects: ambient background, particles, confetti, sounds. */
(function () {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------- background
  const bg = document.getElementById("bg");
  const bctx = bg.getContext("2d");
  const GLYPHS = [">>>", "[]", "{}", "()", ":", "#", "==", "**", "//", "%", "for", "in", "if", "def", "\"\"", "[::-1]", "None", "True", "+=", "*args", "len()", "0", "1"];
  let W = 0, H = 0, DPR = 1;
  let glyphs = [];
  let mouse = { x: 0.5, y: 0.5 };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    for (const c of [bg, fxc]) {
      c.width = W * DPR; c.height = H * DPR;
      c.style.width = W + "px"; c.style.height = H + "px";
    }
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.round(Math.min(46, (W * H) / 32000));
    glyphs = Array.from({ length: n }, () => newGlyph(true));
  }

  function newGlyph(anywhere) {
    const depth = Math.random();
    return {
      t: GLYPHS[(Math.random() * GLYPHS.length) | 0],
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 30,
      d: depth,
      v: 0.08 + depth * 0.25,
      a: 0.04 + depth * 0.10,
      s: 10 + depth * 10,
      hue: Math.random() < 0.5 ? "75,139,223" : "255,212,59",
      wob: Math.random() * Math.PI * 2,
    };
  }

  let tBg = 0;
  function drawBg() {
    tBg += 1;
    bctx.clearRect(0, 0, W, H);
    const px = (mouse.x - 0.5) * 14, py = (mouse.y - 0.5) * 14;
    bctx.textAlign = "center";
    for (const g of glyphs) {
      if (!reduced) {
        g.y -= g.v;
        g.wob += 0.006;
        if (g.y < -30) Object.assign(g, newGlyph(false));
      }
      const x = g.x + Math.sin(g.wob) * 8 + px * g.d;
      const y = g.y + py * g.d;
      bctx.font = `500 ${g.s}px "JetBrains Mono", monospace`;
      bctx.fillStyle = `rgba(${g.hue},${g.a})`;
      bctx.fillText(g.t, x, y);
    }
    if (!reduced) requestAnimationFrame(drawBg);
  }

  // ---------------------------------------------------------- particles
  const fxc = document.getElementById("fx");
  const fctx = fxc.getContext("2d");
  let parts = [];
  let running = false;

  function loop() {
    fctx.clearRect(0, 0, W, H);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.life -= 1;
      p.vy += p.g;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.vr;
      const a = Math.min(1, p.life / 30);
      fctx.save();
      fctx.globalAlpha = a;
      fctx.translate(p.x, p.y);
      fctx.rotate(p.rot);
      fctx.fillStyle = p.c;
      if (p.shape === "rect") fctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else if (p.shape === "text") { fctx.font = `700 ${p.s}px "JetBrains Mono", monospace`; fctx.fillText(p.t, 0, 0); }
      else { fctx.beginPath(); fctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); fctx.fill(); }
      fctx.restore();
    }
    if (parts.length) requestAnimationFrame(loop);
    else { running = false; fctx.clearRect(0, 0, W, H); }
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }

  const COLORS = ["#ffd43b", "#4b8bdf", "#3ddc97", "#7cc4ff", "#ffe98a", "#ff8fa3"];

  function burst(x, y, n = 26, colors = COLORS) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, g: 0.12, drag: 0.96,
        life: 40 + Math.random() * 30, s: 4 + Math.random() * 5, rot: 0, vr: 0,
        c: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.3 ? "rect" : "dot",
      });
    }
    kick();
  }

  function confetti(n = 140) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 9), vy: -(8 + Math.random() * 9),
        g: 0.22, drag: 0.985, life: 120 + Math.random() * 70, s: 7 + Math.random() * 7,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: COLORS[(Math.random() * COLORS.length) | 0], shape: Math.random() < 0.15 ? "text" : "rect",
        t: [">>>", "{}", "[]", "✓"][(Math.random() * 4) | 0],
      });
    }
    kick();
  }

  function floatText(x, y, text, cls = "") {
    const el = document.createElement("div");
    el.className = "float-text " + cls;
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  function countUp(el, to, ms = 900, fmt = v => Math.round(v)) {
    if (reduced) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(to * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------- sound
  let actx = null;
  let soundOn = true;
  function ctx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type = "sine", vol = 0.12) {
    const c = ctx(); if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.05);
  }
  const SOUNDS = {
    ok: () => { tone(660, 0, 0.12, "triangle"); tone(990, 0.08, 0.18, "triangle"); },
    combo: () => { [660, 830, 990, 1320].forEach((f, i) => tone(f, i * 0.06, 0.16, "triangle", 0.1)); },
    bad: () => { tone(180, 0, 0.22, "sawtooth", 0.06); tone(140, 0.08, 0.25, "sawtooth", 0.05); },
    click: () => tone(1200, 0, 0.03, "square", 0.025),
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, "triangle", 0.1)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.12, 0.3, "sine", 0.1)); },
    level: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.25, "sine", 0.09)); },
  };
  function play(name) { if (soundOn && SOUNDS[name]) try { SOUNDS[name](); } catch (e) { /* ignore */ } }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => { mouse.x = e.clientX / W; mouse.y = e.clientY / H; });
  resize();
  drawBg();
  if (document.fonts) document.fonts.ready.then(() => { if (reduced) drawBg(); });

  window.FX = {
    burst, confetti, floatText, countUp, play, reduced,
    setSound(v) { soundOn = v; },
    get sound() { return soundOn; },
  };
})();
