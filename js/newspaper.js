// News section: a broadsheet lying on the page, rendered with three.js.
// Pages are painted from the <ol class="news-list"> in the HTML, so the headlines are the real updates.
import * as THREE from 'three';

const press = document.querySelector('.press');
const canvas = press && press.querySelector('canvas');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TITLE = 'The Dhankhar Dispatch';
const PW = 1, PH = 1.36;                      // page size in world units
const TEX_W = 880, TEX_H = Math.round(TEX_W * PH / PW);
const INK = '#2a2318', PAPER = '#e8dcc3';

if (canvas && !matchMedia('(max-width: 479px)').matches) {
  init().catch(err => { console.warn('newspaper: using the plain list', err); press.classList.remove('live'); });
}

async function init() {
  const items = readItems();
  if (!items.length) return;
  await Promise.all([
    ...['700 100px Gelasio', '400 100px Gelasio', 'italic 400 100px Gelasio', '400 100px UnifrakturMaguntia'].map(f => document.fonts ? document.fonts.load(f) : Promise.resolve()),
    ...items.filter(it => it.img).map(it => new Promise(res => { const im = new Image(); im.onload = () => { it.image = im; res(); }; im.onerror = () => res(); setTimeout(res, 4000); im.src = it.img; })),
  ]).catch(() => {});

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 20);
  const DIR = new THREE.Vector3(0, Math.sin(62 * Math.PI / 180), Math.cos(62 * Math.PI / 180)), LOOK = new THREE.Vector3(0, 0.05, 0.02);
  function frameCamera() {                           // back the camera off along a fixed line of sight until the whole spread fits
    const v = new THREE.Vector3(), corners = [[-PW, 0, PH / 2], [PW, 0, PH / 2], [-PW, 0, -PH / 2], [PW, 0, -PH / 2]];
    for (let d = 2.4; d <= 10; d += 0.03) {
      camera.position.copy(LOOK).addScaledVector(DIR, d); camera.lookAt(LOOK); camera.updateMatrixWorld();
      if (corners.every(c => { v.set(c[0], c[1], c[2]).project(camera); return Math.abs(v.x) <= 0.96 && v.y <= 0.97 && v.y >= -0.94; })) break;
    }
  }

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xcfc4b0, 1.0));
  const key = new THREE.DirectionalLight(0xfff4e4, 2.5);
  key.position.set(-1.6, 3.2, 1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 10;
  key.shadow.camera.left = -2.2; key.shadow.camera.right = 2.2; key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -2.2;
  key.shadow.radius = 6; key.shadow.blurSamples = 12; key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  const paper = new THREE.Group();
  scene.add(paper);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.16 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = -0.04; catcher.receiveShadow = true;
  scene.add(catcher);

  // ---------- pages ----------
  const pages = paginate(items);                      // array of canvases
  const textures = pages.map(c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; });
  const blank = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = PAPER; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const texAt = (i) => textures[i] || blank;
  const spreads = Math.ceil(pages.length / 2);
  let spread = 0;

  const pageMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
  const flat = new THREE.PlaneGeometry(PW, PH);
  const leftPage = new THREE.Mesh(flat, pageMat(texAt(0)));
  const rightPage = new THREE.Mesh(flat, pageMat(texAt(1)));
  for (const [m, x] of [[leftPage, -PW / 2], [rightPage, PW / 2]]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.001, 0); m.receiveShadow = true; paper.add(m); }
  // a few folded sheets under the open spread: thin slabs, each nudged a little, so the edges read as layered pages
  const edgeMats = [0xdccfb4, 0xcfc1a2, 0xd6c9ad, 0xc9bb9b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  for (const x of [-PW / 2, PW / 2]) for (let k = 0; k < 4; k++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.006 - k * 0.004, 0.011, PH - 0.006 - k * 0.003), edgeMats[k]);
    slab.position.set(x + (x < 0 ? 1 : -1) * k * 0.002 + ((k % 2) ? 0.003 : -0.002), -0.0055 - k * 0.0115, (k % 2) ? -0.004 : 0.003);
    slab.castShadow = k === 3; slab.receiveShadow = true; paper.add(slab);
  }

  // flipping page: one geometry deformed every frame, front and back meshes
  const SU = 40, SV = 22;
  const base = new THREE.PlaneGeometry(PW, PH, SU, SV);
  const uvs = base.attributes.uv.array, pos0 = base.attributes.position.array;
  const makeFlipGeo = (mirror) => {
    const g = new THREE.BufferGeometry();
    g.setIndex(base.index.clone());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos0.length), 3));
    const uv = new Float32Array(uvs.length);
    for (let i = 0; i < uvs.length; i += 2) { uv[i] = mirror ? 1 - uvs[i] : uvs[i]; uv[i + 1] = uvs[i + 1]; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos0.length), 3));
    return g;
  };
  const flipFrontGeo = makeFlipGeo(false), flipBackGeo = makeFlipGeo(true);
  const flipFront = new THREE.Mesh(flipFrontGeo, pageMat(blank));
  const flipBack = new THREE.Mesh(flipBackGeo, pageMat(blank)); flipBack.material.side = THREE.BackSide;
  for (const m of [flipFront, flipBack]) { m.castShadow = true; m.receiveShadow = true; m.visible = false; m.frustumCulled = false; paper.add(m); }
  const n = pos0.length / 3, prof = new Float32Array((SU + 1) * 2);
  function deform(t) {
    // t = 0: lying on the right; t = 1: lying on the left. The sheet is treated as inextensible: its tangent angle
    // is base + bend(s), and the profile is integrated along the page, so the free edge lifts first and curls over.
    const base = Math.PI * t, bend = 0.95 * Math.sin(Math.PI * t) * (1 - 0.35 * t), ds = PW / SU;
    let x = 0, y = 0.003;
    for (let c = 0; c <= SU; c++) {
      prof[c * 2] = x; prof[c * 2 + 1] = y;
      const s = (c + 0.5) / SU, phi = base + bend * s * (1 - 0.35 * s);
      x += ds * Math.cos(phi); y += ds * Math.sin(phi);
    }
    const a = flipFrontGeo.attributes.position.array, b = flipBackGeo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const c = i % (SU + 1), z = -pos0[i * 3 + 1];
      a[i * 3] = b[i * 3] = prof[c * 2]; a[i * 3 + 1] = b[i * 3 + 1] = prof[c * 2 + 1]; a[i * 3 + 2] = b[i * 3 + 2] = z;
    }
    flipFrontGeo.attributes.position.needsUpdate = true; flipBackGeo.attributes.position.needsUpdate = true;
    flipFrontGeo.computeVertexNormals(); flipBackGeo.computeVertexNormals();
  }

  // ---------- flipping ----------
  let anim = null;                                     // { from, to, start, dur, done }
  const indicator = press.querySelector('.press-page');
  const btnPrev = press.querySelector('.press-prev'), btnNext = press.querySelector('.press-next');
  function updateUI() {
    if (indicator) indicator.textContent = `Pages ${spread * 2 + 1}–${Math.min(spread * 2 + 2, pages.length)} of ${pages.length}`;
    if (btnPrev) btnPrev.disabled = spread === 0;
    if (btnNext) btnNext.disabled = spread >= spreads - 1;
  }
  function flip(dir) {
    if (anim) return;
    const target = spread + dir;
    if (target < 0 || target >= spreads) return;
    const cur = spread, nxt = target;
    if (dir > 0) {
      leftPage.material.map = texAt(cur * 2); rightPage.material.map = texAt(nxt * 2 + 1);
      flipFront.material.map = texAt(cur * 2 + 1); flipBack.material.map = texAt(nxt * 2);
    } else {
      leftPage.material.map = texAt(nxt * 2); rightPage.material.map = texAt(cur * 2 + 1);
      flipFront.material.map = texAt(nxt * 2 + 1); flipBack.material.map = texAt(cur * 2);
    }
    for (const m of [leftPage, rightPage, flipFront, flipBack]) m.material.needsUpdate = true;
    flipFront.visible = flipBack.visible = true;
    anim = { from: dir > 0 ? 0 : 1, to: dir > 0 ? 1 : 0, start: performance.now(), dur: reduceMotion ? 1 : 1150, done: () => {
      spread = nxt;
      leftPage.material.map = texAt(spread * 2); rightPage.material.map = texAt(spread * 2 + 1);
      leftPage.material.needsUpdate = rightPage.material.needsUpdate = true;
      flipFront.visible = flipBack.visible = false; anim = null; dirty = true; updateUI();
    } };
    deform(anim.from); updateUI();
  }
  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  // ---------- interaction ----------
  btnPrev && btnPrev.addEventListener('click', () => flip(-1));
  btnNext && btnNext.addEventListener('click', () => flip(1));
  press.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { flip(1); e.preventDefault(); } if (e.key === 'ArrowLeft') { flip(-1); e.preventDefault(); } });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  const hitSide = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([leftPage, rightPage], false);
    return hits.length ? (hits[0].object === rightPage ? 1 : -1) : 0;
  };
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
    if (moved < 6) { const s = hitSide(e); if (s) flip(s); }
  });
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    tilt.tx = -py * 0.07; tilt.ty = px * 0.09;
    const s = hitSide(e);
    canvas.style.cursor = (s === 1 && spread < spreads - 1) || (s === -1 && spread > 0) ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => { tilt.tx = 0; tilt.ty = 0; });

  // ---------- sizing & loop ----------
  let visible = true, raf = 0, dirty = true;
  function resize() {
    const w = press.clientWidth, h = canvas.clientHeight || Math.round(w * 0.56);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    frameCamera(); dirty = true;
  }
  resize();
  new ResizeObserver(resize).observe(press);
  new IntersectionObserver((en) => { visible = en[en.length - 1].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { threshold: 0.02 }).observe(press);
  function frame(now) {
    raf = 0;
    if (anim) {
      const k = Math.min(1, (now - anim.start) / anim.dur);
      deform(anim.from + (anim.to - anim.from) * ease(k));
      if (k >= 1) anim.done();
    }
    const settling = Math.abs(tilt.tx - tilt.x) > 1e-4 || Math.abs(tilt.ty - tilt.y) > 1e-4;
    tilt.x += (tilt.tx - tilt.x) * 0.08; tilt.y += (tilt.ty - tilt.y) * 0.08;
    paper.rotation.x = tilt.x; paper.rotation.y = tilt.y;
    if (anim || settling || dirty) { renderer.render(scene, camera); dirty = false; }
    if (!press.classList.contains('live')) press.classList.add('live');
    if (visible) raf = requestAnimationFrame(frame);
  }
  updateUI();
  raf = requestAnimationFrame(frame);
}

// ---------- data ----------
function readItems() {
  return [...document.querySelectorAll('.news-list li')].map(li => {
    const time = li.querySelector('time'), b = li.querySelector('b');
    const walk = (node) => [...node.childNodes].map(nd => nd === time || nd === b ? '' : (nd.nodeType === 3 ? nd.textContent : walk(nd))).join('');
    const summary = walk(li).replace(/\s+/g, ' ').trim();
    return { date: fmtDate(time ? time.getAttribute('datetime') || time.textContent : ''), head: b ? b.textContent.trim() : '', body: summary, img: li.dataset.img || '', caption: li.dataset.caption || '' };
  });
}
function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return s.toUpperCase();
  const names = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return `${names[+m[2] - 1]} ${m[1]}`;
}

// ---------- painting ----------
let noiseTile = null;
function noise() {
  if (noiseTile) return noiseTile;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = 90 + Math.random() * 110; img.data[i] = v; img.data[i + 1] = v * 0.93; img.data[i + 2] = v * 0.8; img.data[i + 3] = 26; }
  g.putImageData(img, 0, 0); noiseTile = c; return c;
}
function paperBackground(ctx, W, H, side) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  if (side) { const fg = ctx.createLinearGradient(side > 0 ? 0 : W, 0, side > 0 ? W * 0.14 : W * 0.86, 0); fg.addColorStop(0, 'rgba(70,45,20,0.22)'); fg.addColorStop(1, 'rgba(70,45,20,0)'); ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); }
  const lg = ctx.createLinearGradient(0, 0, W, 0);
  lg.addColorStop(0, 'rgba(120,85,45,0.16)'); lg.addColorStop(0.12, 'rgba(120,85,45,0)'); lg.addColorStop(0.88, 'rgba(120,85,45,0)'); lg.addColorStop(1, 'rgba(120,85,45,0.16)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78);
  vg.addColorStop(0, 'rgba(110,80,40,0)'); vg.addColorStop(1, 'rgba(110,80,40,0.17)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = ctx.createPattern(noise(), 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(110,80,40,0.10)'; ctx.lineWidth = 1;
  for (let i = 0; i < 260; i++) { const x = Math.random() * W, y = Math.random() * H, l = 6 + Math.random() * 26; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + (Math.random() - 0.5) * 3); ctx.stroke(); }
  ctx.restore();
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 80 + Math.random() * 160;
    const sg = ctx.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, 'rgba(150,110,60,0.10)'); sg.addColorStop(1, 'rgba(150,110,60,0)');
    ctx.fillStyle = sg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}
function wrap(ctx, text, width) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function rule(ctx, x1, x2, y, w = 1.5, alpha = 0.75) { ctx.save(); ctx.strokeStyle = INK; ctx.globalAlpha = alpha; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); ctx.restore(); }
function smallCaps(ctx, text, x, y, px, spacing = 0.18) { ctx.save(); ctx.font = `500 ${px}px Gelasio, Georgia, serif`; ctx.letterSpacing = `${spacing * px}px`; ctx.fillText(text.toUpperCase(), x, y); ctx.restore(); }

const S = 1.25;                                   // texture supersampling, keeps type crisp on retina screens
function newPage(side) {
  const c = document.createElement('canvas'); c.width = Math.round(TEX_W * S); c.height = Math.round(TEX_H * S);
  const ctx = c.getContext('2d'); ctx.scale(S, S); paperBackground(ctx, TEX_W, TEX_H, side);
  ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
  return { c, ctx };
}
function wrapW(ctx, text, widthAt) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > widthAt(lines.length) && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
let K = 1;                                        // type scale, chosen so the issue fills its pages
function wrapBalanced(ctx, text, width) {
  // like wrap(), but with the breaks chosen so the lines come out close to the same length
  const greedy = wrap(ctx, text, width), n = greedy.length, words = text.split(' ');
  if (n < 2 || n > 4 || words.length > 14) return greedy;
  let best = greedy, bestScore = Infinity;
  const rec = (start, left, acc) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')], ws = lines.map(l => ctx.measureText(l).width);
      if (Math.max(...ws) > width) return;
      const mean = ws.reduce((a, b) => a + b, 0) / ws.length, score = ws.reduce((a, b) => a + (b - mean) ** 2, 0);
      if (score < bestScore) { bestScore = score; best = lines; }
      return;
    }
    for (let k = start + 1; k <= words.length - (left - 1); k++) { const line = words.slice(start, k).join(' '); if (ctx.measureText(line).width > width) break; rec(k, left - 1, [...acc, line]); }
  };
  rec(0, n, []);
  return best;
}
function measureItem(ctx, it, colW, lead) {
  let hs = (lead ? 62 : 39) * K;
  const bs = (lead ? 28 : 26.5) * K, hlh = lead ? 1.06 : 1.08, blh = lead ? 1.36 : 1.33;
  ctx.font = `700 ${hs}px Gelasio, Georgia, serif`; let hl = wrapBalanced(ctx, it.head, colW);
  while (lead && hl.length > 2 && hs > 50 * K) { hs -= 2; ctx.font = `700 ${hs}px Gelasio, Georgia, serif`; hl = wrapBalanced(ctx, it.head, colW); }   // the lead headline stays on two lines
  hl = hl.slice(0, lead ? 3 : 4);
  let fig = null;
  if (it.image && it.image.naturalWidth) {
    const ih = Math.min(Math.round(colW * it.image.naturalHeight / it.image.naturalWidth), Math.round(colW * (lead ? 0.5 : 0.9)));
    ctx.font = `italic 400 ${20 * K}px Gelasio, Georgia, serif`; const cl = it.caption ? wrap(ctx, it.caption, colW).slice(0, 2) : [];
    fig = { ih, cl, h: 14 + ih + (cl.length ? 8 + cl.length * 24 * K : 0) + 4 };
  }
  let bl = [], cap = null, body = it.body || '';
  if (body) {
    if (lead && /^[A-Za-z]/.test(body)) {
      cap = { ch: body[0], px: 128 * K }; ctx.font = `700 ${cap.px}px Gelasio, Georgia, serif`; cap.w = Math.ceil(ctx.measureText(cap.ch).width) + 12; body = body.slice(1).trimStart();
    }
    ctx.font = `400 ${bs}px Gelasio, Georgia, serif`;
    bl = wrapW(ctx, body, k => cap && k < 3 ? colW - cap.w : colW).slice(0, lead ? 6 : 9);
    if (cap) cap.lines = Math.min(3, bl.length);
  }
  const h = 30 * K + hl.length * hs * hlh + (fig ? fig.h : 0) + (bl.length ? 10 + bl.length * bs * blh : 0) + 28;
  return { hl, bl, hs, bs, hlh, blh, cap, fig, h };
}
function drawItem(ctx, it, m, x, y, colW) {
  ctx.fillStyle = INK;
  ctx.save(); ctx.globalAlpha = 0.72; smallCaps(ctx, it.date, x, y + 20 * K, 20 * K, 0.16); ctx.restore();
  let yy = y + 30 * K;
  ctx.font = `700 ${m.hs}px Gelasio, Georgia, serif`;
  for (const l of m.hl) { yy += m.hs * m.hlh; ctx.fillText(l, x, yy - m.hs * 0.22); }
  if (m.fig) {
    yy += 14; printed(ctx, it.image, x, yy, colW, m.fig.ih); yy += m.fig.ih;
    if (m.fig.cl.length) { yy += 8; ctx.save(); ctx.globalAlpha = 0.8; ctx.font = `italic 400 ${20 * K}px Gelasio, Georgia, serif`; for (const l of m.fig.cl) { yy += 24 * K; ctx.fillText(l, x, yy - 6 * K); } ctx.restore(); }
    yy += 4;
  }
  if (m.bl.length) {
    yy += 10;
    if (m.cap) { ctx.save(); ctx.font = `700 ${m.cap.px}px Gelasio, Georgia, serif`; ctx.fillText(m.cap.ch, x - 2, yy + m.cap.lines * m.bs * m.blh - m.bs * 0.3); ctx.restore(); }
    ctx.font = `400 ${m.bs}px Gelasio, Georgia, serif`;
    m.bl.forEach((l, k) => { yy += m.bs * m.blh; ctx.fillText(l, x + (m.cap && k < 3 ? m.cap.w : 0), yy - m.bs * 0.3); });
  }
  rule(ctx, x, x + Math.min(70, colW), yy + 14, 1.5, 0.45);
  return yy + 28;
}
function printed(ctx, image, x, y, w, h) {
  const dw = Math.round(w * S), dh = Math.round(h * S);
  const off = document.createElement('canvas'); off.width = dw; off.height = dh; const g = off.getContext('2d');
  const nw = image.naturalWidth, nh = image.naturalHeight, a = w / h;
  let sw = nw, sh = nh, sx = 0, sy = 0;
  if (nw / nh > a) { sw = Math.round(nh * a); sx = Math.round((nw - sw) / 2); } else { sh = Math.round(nw / a); sy = Math.round((nh - sh) / 2); }
  g.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
  try {
    const id = g.getImageData(0, 0, dw, dh), d = id.data;
    for (let py = 0; py < dh; py++) for (let px = 0; px < dw; px++) {
      const i = (py * dw + px) * 4;
      let v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - 128) * 1.08 + 140;
      v += Math.sin((px + py) * 0.62) * Math.sin((px - py) * 0.62) * 20;        // a faint halftone screen
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = v; d[i + 1] = v * 0.97; d[i + 2] = v * 0.9; d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  } catch (e) { /* tainted canvas: fall back to the plain image */ }
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(off, x, y, w, h); ctx.restore();
  ctx.save(); ctx.strokeStyle = INK; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.restore();
}
function runningHead(ctx, W, margin, n) {
  ctx.save(); ctx.globalAlpha = 0.75; smallCaps(ctx, TITLE, margin, 66, 17, 0.2); ctx.textAlign = 'right'; smallCaps(ctx, `Page ${n}`, W - margin, 66, 17, 0.2); ctx.restore();
  rule(ctx, margin, W - margin, 84, 2.2, 0.85); rule(ctx, margin, W - margin, 90, 1, 0.85);
}
function folio(ctx, W, H, margin, n) {
  rule(ctx, margin, W - margin, H - 64, 1, 0.5);
  ctx.save(); ctx.globalAlpha = 0.7; ctx.textAlign = 'center'; smallCaps(ctx, `— ${n} —`, W / 2, H - 36, 17, 0.2); ctx.textAlign = 'left'; smallCaps(ctx, TITLE, margin, H - 36, 14, 0.18); ctx.textAlign = 'right'; smallCaps(ctx, 'harshit2807161.github.io', W - margin, H - 36, 14, 0.12); ctx.restore();
}
const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n] || String(n);

// Split one page's items over two columns so the columns end close together (left a touch longer, as in print).
function balancedSplit(hs, avail) {
  let best = null;
  for (let s = 1; s <= hs.length; s++) {
    const h1 = hs.slice(0, s).reduce((a, b) => a + b, 0), h2 = hs.slice(s).reduce((a, b) => a + b, 0);
    if (h1 > avail || h2 > avail) continue;
    const d = h1 - h2, score = Math.abs(d) + (d < 0 ? 60 : 0);
    if (!best || score < best.score) best = { s, h1, h2, score };
  }
  return best;
}

function paginate(items) {
  const W = TEX_W, H = TEX_H, margin = 58, gutter = 36, colW = (W - 2 * margin - gutter) / 2, bottom = H - 88;
  const probe = document.createElement('canvas').getContext('2d');
  let lead, frontTop, inner, avail, P;
  const measure = () => {
    lead = measureItem(probe, items[0], W - 2 * margin, true);
    frontTop = 262 + lead.h + 18;
    inner = items.slice(1).map(it => measureItem(probe, it, colW, false));
    avail = (p) => bottom - (p === 0 ? frontTop : 122);
    return inner.reduce((a, m) => a + m.h, 0);
  };
  const cap = (n) => 2 * avail(0) + 2 * (n - 1) * avail(1);
  // page count at the base type size (odd, so the back page closes the paper), then a type scale that fills it ~82%
  K = 1; let total = measure();
  let minP = 1; while (cap(minP) * 0.9 < total && minP < 15) minP++;
  P = minP % 2 ? minP : minP + 1;
  for (let pass = 0; pass < 3; pass++) { K = Math.min(1.25, Math.max(0.9, K * Math.sqrt(0.82 / (total / cap(P))))); total = measure(); }
  let plan = null;
  const attempt = (P, slack) => {
    // share the items over P pages in proportion to each page's capacity; slack > 1 lets early pages take more,
    // and Infinity packs greedily so the plan still closes when the pieces are chunky
    const total = inner.reduce((a, m) => a + m.h, 0);
    const w = Array.from({ length: P }, (_, p) => avail(p)), wsum = w.reduce((a, b) => a + b, 0);
    const out = []; let i = 0;
    for (let p = 0; p < P; p++) {
      const target = total * w[p] / wsum * slack, list = []; let acc = 0, split = null;
      while (i < inner.length && (p === P - 1 || !list.length || acc + inner[i].h * 0.5 < target)) { list.push(i); acc += inner[i].h; i++; }
      while (list.length && !(split = balancedSplit(list.map(k => inner[k].h), avail(p)))) { list.pop(); i--; }
      out.push({ list, split });
    }
    return i >= inner.length ? out : null;
  };
  const tryPlan = (P) => attempt(P, 1) || attempt(P, 1.1) || attempt(P, 1.22) || attempt(P, Infinity);
  for (let guard = 0; !(plan = tryPlan(P)) && guard < 10; guard++) { K *= 0.975; total = measure(); }   // too tight to pack: ease the type a little
  if (!plan) { K = 1; measure(); P += 2; plan = tryPlan(P) || tryPlan(P + 2); }

  const pages = [];
  plan.forEach(({ list, split }, p) => {
    const side = p % 2 === 0 ? 1 : -1;                      // left-hand pages shade toward their right edge, right-hand toward their left
    const { c, ctx } = newPage(side);
    let top;
    if (p === 0) {
      rule(ctx, margin, W - margin, 60, 1.2, 0.6);
      ctx.save(); let mh = 96; ctx.font = `400 ${mh}px UnifrakturMaguntia, Gelasio, serif`; const tw = ctx.measureText(TITLE).width, maxW = W - 2 * margin - 10; if (tw > maxW) { mh = Math.floor(mh * maxW / tw); ctx.font = `400 ${mh}px UnifrakturMaguntia, Gelasio, serif`; }
      ctx.textAlign = 'center'; ctx.fillText(TITLE, W / 2, 158); ctx.restore();
      rule(ctx, margin, W - margin, 184, 1.2, 0.6);
      const now = new Date();
      ctx.save(); ctx.textAlign = 'center'; ctx.globalAlpha = 0.8; smallCaps(ctx, `Vol. ${roman(now.getFullYear() - 2020)} · San Diego, California · ${now.toLocaleString('en-US', { month: 'long', year: 'numeric' })} · Price: one coffee`, W / 2, 214, 17, 0.2); ctx.restore();
      rule(ctx, margin, W - margin, 232, 3, 0.85); rule(ctx, margin, W - margin, 239, 1, 0.85);
      const end = drawItem(ctx, items[0], lead, margin, 262, W - 2 * margin);
      rule(ctx, margin, W - margin, end - 6, 1.2, 0.6);
      top = frontTop;
    } else { runningHead(ctx, W, margin, p + 1); top = 122; }
    const cols = [margin, margin + colW + gutter];
    let y1 = top, y2 = top;
    list.forEach((k, j) => {
      const inLeft = j < split.s;
      const y = drawItem(ctx, items[k + 1], inner[k], cols[inLeft ? 0 : 1], inLeft ? y1 : y2, colW);
      if (inLeft) y1 = y; else y2 = y;
    });
    const colEnd = Math.max(y1, y2) - 12;
    if (colEnd > top + 20) { ctx.save(); ctx.strokeStyle = INK; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(margin + colW + gutter / 2, top - 6); ctx.lineTo(margin + colW + gutter / 2, colEnd); ctx.stroke(); ctx.restore(); }
    folio(ctx, W, H, margin, p + 1);
    pages.push(c);
  });

  // back page: classifieds, colophon and the weather
  {
    const { c, ctx } = newPage(-1);
    runningHead(ctx, W, margin, pages.length + 1);
    ctx.save(); ctx.textAlign = 'center'; ctx.font = `400 54px UnifrakturMaguntia, Gelasio, serif`; ctx.fillText('Classifieds & Notices', W / 2, 160); ctx.restore();
    rule(ctx, margin, W - margin, 184, 1.2, 0.6);
    const box = (y, h, title, lines) => {
      ctx.save(); ctx.strokeStyle = INK; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.strokeRect(margin + 10, y, W - 2 * margin - 20, h); ctx.lineWidth = 1; ctx.strokeRect(margin + 18, y + 8, W - 2 * margin - 36, h - 16); ctx.restore();
      ctx.save(); ctx.textAlign = 'center'; smallCaps(ctx, title, W / 2, y + 48, 19, 0.22);
      ctx.font = `400 25px Gelasio, Georgia, serif`;
      lines.forEach((l, k) => ctx.fillText(l, W / 2, y + 92 + k * 34)); ctx.restore();
    };
    box(214, 300, 'Situations wanted', ['MS Computer Science, UC San Diego, Dec 2026.', 'Seeks an ML / AI engineering or research role', 'from January 2027. Reinforcement learning,', 'LLM agents, and systems that actually ship.', 'Apply within: hdhankhar@ucsd.edu']);
    box(548, 236, 'Colophon', ['Printed in San Diego, California.', 'Set in Gelasio and UnifrakturMaguntia;', 'laid out on canvas, bound with three.js.', 'Back issues: 2021 – 2026.']);
    box(818, 150, 'Weather', ['San Diego: 72°F and sunny, as usual.', 'Patna: humid. Paris: raining, beautifully.']);
    folio(ctx, W, H, margin, pages.length + 1);
    pages.push(c);
  }
  return pages;
}
