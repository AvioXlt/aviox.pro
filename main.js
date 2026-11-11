/* AvioX — interactions. No dependencies. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';

  /* nav state */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* reveal + line drawing */
  document.querySelectorAll('.draw path, .draw line').forEach(p => {
    try { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); } catch (e) {}
  });
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.rv, .draw').forEach(el => io.observe(el));

  /* ---------- wing specimen (plan view, veined membrane) ---------- */
  const wingHost = document.querySelector('[data-wing]');
  if (wingHost) {
    const R = [280, 300];
    const fore = [[-18,-12],[-58,-150],[-138,-232],[-232,-218],[-266,-124],[-214,-42],[-120,8],[-40,18]];
    const hind = [[-22,16],[-118,42],[-192,112],[-152,176],[-72,146],[-26,64]];
    const pt = ([x, y]) => `${R[0] + x},${R[1] + y}`;
    const mkWing = side => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', side === 'l' ? 'wing-l' : 'wing-r');
      const inner = document.createElementNS(NS, 'g');
      if (side === 'r') inner.setAttribute('transform', `translate(${2 * R[0]},0) scale(-1,1)`);
      [fore, hind].forEach(poly => {
        const m = document.createElementNS(NS, 'polygon');
        m.setAttribute('points', poly.map(pt).join(' '));
        m.setAttribute('class', 'membrane');
        inner.appendChild(m);
        poly.forEach(([x, y]) => {           // radial veins from the root
          const l = document.createElementNS(NS, 'path');
          const cx = x * .45 + y * .08, cy = y * .45 - x * .05;
          l.setAttribute('d', `M${R[0]},${R[1]} Q${R[0] + cx},${R[1] + cy} ${R[0] + x},${R[1] + y}`);
          l.setAttribute('class', 'vein');
          inner.appendChild(l);
        });
        const cross = document.createElementNS(NS, 'polyline');   // cross-vein at 58 %
        cross.setAttribute('points', poly.map(([x, y]) => `${R[0] + x * .58},${R[1] + y * .58}`).join(' '));
        cross.setAttribute('class', 'vein'); cross.setAttribute('opacity', '.55');
        inner.appendChild(cross);
      });
      g.appendChild(inner);
      return g;
    };
    wingHost.prepend(mkWing('r'));
    wingHost.prepend(mkWing('l'));
  }

  /* ---------- involute-ish gears ---------- */
  const gearPath = (cx, cy, teeth, r) => {
    const add = r * .11, ded = r * .13, d = [];
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * Math.PI * 2, s = Math.PI * 2 / teeth;
      const P = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      d.push(`${i ? 'L' : 'M'}${P(r - ded, a)}`, `L${P(r + add, a + s * .18)}`, `L${P(r + add, a + s * .42)}`, `L${P(r - ded, a + s * .6)}`);
    }
    return d.join(' ') + 'Z';
  };
  document.querySelectorAll('[data-gears]').forEach(svg => {
    // each <g data-gear="cx cy teeth r dir"> gets a tooth profile and spins at the meshing ratio
    const base = parseFloat(svg.dataset.gears) || 8;   // seconds per rev of the first gear
    let t0;
    svg.querySelectorAll('[data-gear]').forEach(g => {
      const [cx, cy, n, r] = g.dataset.gear.split(' ').map(Number);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', gearPath(cx, cy, n, r));
      g.prepend(p);
      t0 = t0 || n;
      const dur = parseFloat(g.dataset.period) || base * n / t0;   // ω ∝ 1/teeth unless a period is given (compound shafts)
      g.style.transformOrigin = `${cx}px ${cy}px`;
      g.style.transformBox = 'view-box';
      if (!reduce) g.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${g.dataset.dir === '-1' ? -360 : 360}deg)` }],
        { duration: dur * 1000, iterations: Infinity });
    });
  });

  /* ---------- lightbox ---------- */
  const lb = document.querySelector('.lightbox');
  if (lb) {
    const im = lb.querySelector('img');
    document.querySelectorAll('[data-full]').forEach(f => f.addEventListener('click', () => {
      im.src = f.dataset.full; im.alt = f.querySelector('img')?.alt || ''; lb.classList.add('open');
    }));
    lb.addEventListener('click', () => lb.classList.remove('open'));
    addEventListener('keydown', e => e.key === 'Escape' && lb.classList.remove('open'));
  }

  /* ---------- live potential flow around a Joukowski airfoil ---------- */
  const cv = document.getElementById('flow');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  // complex helpers
  const C = (re, im = 0) => ({ re, im });
  const add = (a, b) => C(a.re + b.re, a.im + b.im), sub = (a, b) => C(a.re - b.re, a.im - b.im);
  const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const abs = a => Math.hypot(a.re, a.im);
  const csqrt = a => { const r = abs(a), re = Math.sqrt((r + a.re) / 2), im = Math.sign(a.im || 1) * Math.sqrt((r - a.re) / 2); return C(re, im); };
  const expi = t => C(Math.cos(t), Math.sin(t));

  const mu = C(-0.09, 0.08), one = C(1), Rr = abs(sub(one, mu)), R2 = Rr * Rr;
  const alpha = 7 * Math.PI / 180, ea = expi(-alpha), eb = expi(alpha);
  // Kutta condition: dF/dζ = 0 at trailing edge ζ = 1  →  Γ
  const te = sub(one, mu);
  const bracket = sub(ea, div(mul(C(R2), eb), mul(te, te)));
  const Gamma = mul(mul(C(0, 2 * Math.PI), te), bracket).re;
  const dFdzeta = z => { const w = sub(z, mu); return add(sub(ea, div(mul(C(R2), eb), mul(w, w))), div(C(0, Gamma / (2 * Math.PI)), w)); };
  const toZeta = z => {
    const s = csqrt(sub(mul(z, z), C(4)));
    const a = mul(add(z, s), C(.5)), b = mul(sub(z, s), C(.5));
    return abs(sub(a, mu)) >= abs(sub(b, mu)) ? a : b;
  };
  const vel = (x, y) => {
    const z = C(x, y), zeta = toZeta(z);
    if (abs(sub(zeta, mu)) < Rr * 1.002) return null;          // inside the section
    const dz = sub(one, div(one, mul(zeta, zeta)));
    const w = div(dFdzeta(zeta), dz);                         // u − iv
    let u = w.re, v = -w.im; const sp = Math.hypot(u, v);
    if (sp > 3) { u *= 3 / sp; v *= 3 / sp; }
    return [u, v];
  };

  let W, H, S, OX, OY, parts = [], running = true, dpr;
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mobile = W < 900;
    S = mobile ? W * .17 : Math.min(W * .085, H * .16);
    OX = mobile ? W * .52 : W * .70; OY = mobile ? H * .90 : H * .84;
    const n = Math.min(520, Math.round(W * H / 3600));
    parts = Array.from({ length: n }, () => spawn(true));
    drawFoil();
  };
  const spawn = anywhere => ({ x: anywhere ? (Math.random() * W - OX) / S : -OX / S - .2, y: (OY - Math.random() * H) / S, age: Math.random() * 200 });
  const foilPts = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160 * Math.PI * 2, zeta = add(mu, C(Rr * Math.cos(t), Rr * Math.sin(t)));
    foilPts.push(add(zeta, div(one, zeta)));
  }
  const drawFoil = () => {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    foilPts.forEach((p, i) => { const X = OX + p.re * S, Y = OY - p.im * S; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath(); ctx.strokeStyle = 'rgba(27,31,26,.7)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  };
  const step = () => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = .9;
    const dt = .012;
    for (const p of parts) {
      const v = vel(p.x, p.y);
      if (!v || p.x * S + OX > W + 10 || p.age > 900) { Object.assign(p, spawn(false)); continue; }
      const nx = p.x + v[0] * dt, ny = p.y + v[1] * dt;
      const sp = Math.hypot(v[0], v[1]);
      ctx.strokeStyle = sp > 1.25 ? `rgba(76,107,69,${Math.min(.75, .25 + (sp - 1) * .5)})` : 'rgba(27,31,26,.28)';
      ctx.beginPath(); ctx.moveTo(OX + p.x * S, OY - p.y * S); ctx.lineTo(OX + nx * S, OY - ny * S); ctx.stroke();
      p.x = nx; p.y = ny; p.age++;
    }
    drawFoil();
  };
  const loop = () => { if (running) step(); requestAnimationFrame(loop); };
  const staticLines = () => {                         // reduced motion: draw streamlines once
    ctx.lineWidth = .8; ctx.strokeStyle = 'rgba(27,31,26,.3)';
    for (let k = 0; k < 34; k++) {
      let x = -OX / S, y = (OY - k / 33 * H) / S; ctx.beginPath(); ctx.moveTo(OX + x * S, OY - y * S);
      for (let i = 0; i < 900; i++) { const v = vel(x, y); if (!v) break; x += v[0] * .02; y += v[1] * .02; ctx.lineTo(OX + x * S, OY - y * S); if (OX + x * S > W) break; }
      ctx.stroke();
    }
    drawFoil();
  };
  resize();
  addEventListener('resize', () => { resize(); if (reduce) staticLines(); });
  if (reduce) staticLines();
  else {
    new IntersectionObserver(([e]) => { running = e.isIntersecting; }).observe(cv);
    document.addEventListener('visibilitychange', () => { running = !document.hidden; });
    loop();
  }
})();
