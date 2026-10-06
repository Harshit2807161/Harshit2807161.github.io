// Interactive lanyard badge: three.js rendering + a small position-based rope/rigid-body simulation.
// Desktop only; the static CSS badge stays as the fallback (mobile, no WebGL, or load failure).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const hero = document.querySelector('.hero');
const wrap = document.querySelector('.badge3d');
const canvas = wrap && wrap.querySelector('canvas');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// World units: 100 units = hero height (so everything scales like the CSS badge's cqh units).
const UNIT = {
  anchorX: 10.5, anchorY: 68,          // strap anchors, above the top edge (y = 50 is the top of the hero)
  junctionY: 28.8,                      // where the two straps meet at rest
  clipLen: 15.7,                        // junction -> hook point inside the slot
  cardW: 35, cardH: 59.5, cardD: 0.7, cardR: 1.8,
  slotFromTop: 4.3,                     // hook point below the card's top edge
  strapW: 2.5, ropeSegments: 10,
};

if (canvas && !matchMedia('(max-width: 700px)').matches) {
  init().catch(err => { console.warn('lanyard: using the static badge', err); hero.classList.remove('live'); });
}

async function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(2 * Math.atan(50 / 200) * 180 / Math.PI, 1, 50, 500);
  camera.position.set(0, 0, 200);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfcfcf, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-70, 110, 170);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 9; key.shadow.blurSamples = 16;
  key.shadow.camera.near = 60; key.shadow.camera.far = 420;
  key.shadow.camera.left = -110; key.shadow.camera.right = 110;
  key.shadow.camera.top = 130; key.shadow.camera.bottom = -110;
  key.shadow.bias = -0.0002;
  scene.add(key, key.target);

  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({ opacity: 0.15 }));
  catcher.position.z = -14;
  catcher.receiveShadow = true;
  scene.add(catcher);

  // ---------- card textures, painted from the same data as the HTML badge ----------
  const data = readCardData();
  await Promise.all([
    document.fonts ? document.fonts.load('600 100px Gelasio') : Promise.resolve(),
    document.fonts ? document.fonts.load('italic 500 100px Gelasio') : Promise.resolve(),
    document.fonts ? document.fonts.load('500 100px Gelasio') : Promise.resolve(),
  ]).catch(() => {});
  const photo = data.photo ? await loadImage(data.photo).catch(() => null) : null;
  const frontTex = canvasTexture(paintFront(data, photo));
  const backTex = canvasTexture(paintBack());
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  frontTex.anisotropy = maxAniso; backTex.anisotropy = maxAniso;

  // ---------- card mesh ----------
  const { cardW, cardH, cardD, cardR } = UNIT;
  const cardGeo = new RoundedBoxGeometry(cardW, cardH, cardD, 3, cardR);
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0xd2d2d2, transparent: true, opacity: 0.94 });
  const frontMat = new THREE.MeshLambertMaterial({ map: frontTex, transparent: true });
  const backMat = new THREE.MeshLambertMaterial({ map: backTex, transparent: true });
  const card = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
  card.castShadow = true;
  card.matrixAutoUpdate = false;
  scene.add(card);

  // ---------- clip: strap end, D-ring, swivel, snap hook ----------
  const metal = new THREE.MeshStandardMaterial({ color: 0xd2d4d7, metalness: 1, roughness: 0.3, envMap: envTex, envMapIntensity: 0.9 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x2b2d28, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMap: envTex, envMapIntensity: 0.35 });
  const clip = new THREE.Group();
  const strapEnd = new THREE.Mesh(new THREE.BoxGeometry(UNIT.strapW, 4.4, 0.55), strapMat); strapEnd.position.y = -2.0;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.32, 14, 40), metal); ring.position.y = -5.4; ring.scale.set(1, 0.85, 1);
  const swivel = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 1.7, 28), metal); swivel.position.y = -8.2;
  const hook = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 6.6, 6, 18), metal); hook.position.y = -13.4;
  const gate = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 3.6, 4, 12), metal); gate.position.set(-0.55, -12.2, 0.2);
  for (const m of [strapEnd, ring, swivel, hook, gate]) { m.castShadow = true; clip.add(m); }
  // stitches on the strap end
  const stitchMat = new THREE.MeshBasicMaterial({ color: 0xa9aba6 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.1), stitchMat);
    s.position.set(-0.6 + i * 0.4, -0.7 - r * 0.45, 0.3); clip.add(s);
  }
  clip.matrixAutoUpdate = false;
  scene.add(clip);

  // ---------- straps (ribbons rebuilt from the rope particles every frame) ----------
  const RIB = 48;
  const makeRibbon = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIB * 2 * 3), 3));
    const n = new Float32Array(RIB * 2 * 3); for (let i = 0; i < RIB * 2; i++) n[i * 3 + 2] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    const idx = [];
    for (let i = 0; i < RIB - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    g.setIndex(idx);
    const m = new THREE.Mesh(g, strapMat); m.frustumCulled = false; return m;
  };
  const ribbonL = makeRibbon(), ribbonR = makeRibbon();
  scene.add(ribbonL, ribbonR);

  // ---------- simulation (position-based dynamics) ----------
  const P = [];
  const addP = (x, y, z, inv) => { const p = { p: new THREE.Vector3(x, y, z), pp: new THREE.Vector3(x, y, z), inv }; P.push(p); return p; };
  const AL = addP(-UNIT.anchorX, UNIT.anchorY, 0, 0), AR = addP(UNIT.anchorX, UNIT.anchorY, 0, 0);
  const J = addP(0, UNIT.junctionY, 0, 1);
  const ropeL = [AL], ropeR = [AR];
  for (let i = 1; i < UNIT.ropeSegments; i++) {
    const t = i / UNIT.ropeSegments;
    ropeL.push(addP(THREE.MathUtils.lerp(AL.p.x, J.p.x, t), THREE.MathUtils.lerp(AL.p.y, J.p.y, t), 0, 1));
    ropeR.push(addP(THREE.MathUtils.lerp(AR.p.x, J.p.x, t), THREE.MathUtils.lerp(AR.p.y, J.p.y, t), 0, 1));
  }
  ropeL.push(J); ropeR.push(J);
  const hookY = UNIT.junctionY - UNIT.clipLen, top = hookY + UNIT.slotFromTop, bot = top - cardH, hw = cardW / 2;
  const H = addP(0, hookY, 0, 1.2);
  const TL = addP(-hw, top, 0, 1), TR = addP(hw, top, 0, 1), BL = addP(-hw, bot, 0, 1), BR = addP(hw, bot, 0, 1);
  const cluster = [H, TL, TR, BL, BR];
  const C = [];
  const link = (a, b, rest) => C.push({ a, b, rest: rest ?? a.p.distanceTo(b.p) });
  for (const rope of [ropeL, ropeR]) for (let i = 0; i < rope.length - 1; i++) link(rope[i], rope[i + 1]);
  link(J, H);
  for (let i = 0; i < cluster.length; i++) for (let k = i + 1; k < cluster.length; k++) link(cluster[i], cluster[k]);
  // a little extra stiffness across the card
  const centerOf = (out) => out.copy(TL.p).add(TR.p).add(BL.p).add(BR.p).multiplyScalar(0.25);

  if (!reduceMotion) { // hang it slightly off to the side so it swings into place on load
    for (const q of cluster) { q.p.x += 7; q.pp.x += 7; }
    J.p.x += 5; J.pp.x += 5;
    for (const rope of [ropeL, ropeR]) rope.forEach((q, i) => { if (q.inv && q !== J) { const t = i / (rope.length - 1); q.p.x += 5 * t; q.pp.x += 5 * t; } });
  }

  const G = -620, DAMP = 0.996, ITER = 12, SUB = 2, DT = 1 / 120;
  const drag = { on: false, target: new THREE.Vector3(), offset: new THREE.Vector3() };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), cen = new THREE.Vector3();
  function step(dt) {
    for (const q of P) {
      if (!q.inv) continue;
      tmp.copy(q.p).sub(q.pp).multiplyScalar(DAMP);
      const sp = tmp.length(); if (sp > 6) tmp.multiplyScalar(6 / sp); // clamp runaway velocity
      q.pp.copy(q.p);
      q.p.add(tmp); q.p.y += G * dt * dt;
    }
    if (drag.on) {
      centerOf(cen); tmp.copy(drag.target).sub(drag.offset).sub(cen);
      for (const q of cluster) q.p.add(tmp);
    }
    for (let it = 0; it < ITER; it++) {
      for (const c of C) {
        tmp.copy(c.b.p).sub(c.a.p); const len = tmp.length(); if (!len) continue;
        const w = c.a.inv + c.b.inv; if (!w) continue;
        tmp.multiplyScalar((len - c.rest) / len);
        c.a.p.addScaledVector(tmp, c.a.inv / w);
        c.b.p.addScaledVector(tmp, -c.b.inv / w);
      }
      if (drag.on) { centerOf(cen); tmp.copy(drag.target).sub(drag.offset).sub(cen).multiplyScalar(0.6); for (const q of cluster) q.p.add(tmp); }
    }
    for (const q of cluster) q.p.z *= 0.975;            // the strap's torsion: the card settles facing front
    for (const rope of [ropeL, ropeR]) for (const q of rope) q.p.z *= 0.9;
  }

  // ---------- pointer interaction ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const toWorld = (e, out) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(dragPlane, out) || out.set(0, 0, 0);
  };
  const hitCard = (e) => { toWorld(e, tmp2); return ray.intersectObject(card, false).length > 0; };
  canvas.addEventListener('pointermove', (e) => {
    if (drag.on) { toWorld(e, drag.target); return; }
    canvas.style.cursor = hitCard(e) ? 'grab' : '';
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!hitCard(e)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    toWorld(e, drag.target); centerOf(cen); drag.offset.copy(drag.target).sub(cen);
    drag.on = true; canvas.style.cursor = 'grabbing';
  });
  const release = (e) => { if (!drag.on) return; drag.on = false; canvas.style.cursor = hitCard(e) ? 'grab' : ''; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);

  // ---------- geometry updates ----------
  const ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3(), m4 = new THREE.Matrix4();
  function updateCard() {
    centerOf(cen);
    ex.copy(TR.p).sub(TL.p).add(BR.p).sub(BL.p).normalize();
    ey.copy(TL.p).sub(BL.p).add(TR.p).sub(BR.p).normalize();
    ez.crossVectors(ex, ey).normalize(); ey.crossVectors(ez, ex).normalize();
    // the hook sits slotFromTop below the top edge, so the mesh centre is below the cluster centre by 0
    card.matrix.makeBasis(ex, ey, ez).setPosition(cen);
    // clip: hangs from J toward H, flat side aligned with the card
    tmp.copy(H.p).sub(J.p).normalize();                      // down the rod
    const cy = tmp.clone().negate();                          // local +y points back up to J
    const cz = ez.clone().addScaledVector(cy, -ez.dot(cy)).normalize();
    const cx = new THREE.Vector3().crossVectors(cy, cz).normalize();
    clip.matrix.makeBasis(cx, cy, cz).setPosition(J.p);
  }
  const curvePts = [], side = new THREE.Vector3(), tan = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  function updateRibbon(mesh, rope) {
    curvePts.length = 0; for (const q of rope) curvePts.push(q.p);
    const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.5);
    const pos = mesh.geometry.attributes.position.array;
    for (let i = 0; i < RIB; i++) {
      const t = i / (RIB - 1);
      curve.getPoint(t, tmp); curve.getTangent(t, tan);
      side.crossVectors(tan, up).normalize().multiplyScalar(UNIT.strapW / 2);
      pos[i * 6] = tmp.x - side.x; pos[i * 6 + 1] = tmp.y - side.y; pos[i * 6 + 2] = tmp.z - side.z;
      pos[i * 6 + 3] = tmp.x + side.x; pos[i * 6 + 4] = tmp.y + side.y; pos[i * 6 + 5] = tmp.z + side.z;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- sizing & loop ----------
  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(hero);

  let visible = true, raf = 0, last = performance.now(), acc = 0, frames = 0;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }, { threshold: 0.02 }).observe(hero);
  function frame(now) {
    raf = 0;
    acc += Math.min(0.3, (now - last) / 1000); last = now;
    while (acc >= DT) { step(DT); acc -= DT; }
    updateCard(); updateRibbon(ribbonL, ropeL); updateRibbon(ribbonR, ropeR);
    renderer.render(scene, camera); frames++;
    if (!hero.classList.contains('live')) { hero.classList.add('live'); requestAnimationFrame(() => hero.classList.add('shown')); }
    if (visible) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

// ---------- helpers ----------
function readCardData() {
  const q = (s) => document.querySelector(s);
  const chips = [...document.querySelectorAll('.badge .chip')].map(c => ({ text: c.textContent.trim(), color: getComputedStyle(c).backgroundColor }));
  return {
    first: q('.badge .first')?.textContent.trim() || 'Harshit',
    last: q('.badge .last')?.textContent.trim() || 'Dhankhar',
    lastColor: '#1400ff',
    nowLabel: 'Currently', now: q('.badge .val')?.textContent.trim() || '',
    thenLabel: 'Previously', chips,
    photo: q('.badge .photo img')?.getAttribute('src') || '',
  };
}
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function canvasTexture(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function paintHolder(ctx, s, W, H) {
  const { cardW, cardH } = UNIT;
  ctx.clearRect(0, 0, W, H);
  // sleeve body
  roundRect(ctx, 0, 0, W, H, 1.8 * s);
  const body = ctx.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, 'rgba(228,228,228,0.97)'); body.addColorStop(0.16, 'rgba(216,216,216,0.96)'); body.addColorStop(0.17, 'rgba(234,234,234,0.95)'); body.addColorStop(1, 'rgba(220,220,220,0.96)');
  ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 0.1 * s; ctx.stroke();
  // seam
  ctx.save(); ctx.translate(0, 7.75 * s);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0.6 * s, i * 0.3 * s, W - 1.2 * s, 0.07 * s); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(0.6 * s, i * 0.3 * s + 0.08 * s, W - 1.2 * s, 0.09 * s); }
  ctx.restore();
  // slot and holes are cut out
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  roundRect(ctx, W / 2 - 3.85 * s, 3.4 * s, 7.7 * s, 1.75 * s, 2 * s); ctx.fill();
  for (const x of [2.9 * s + 1.225 * s, W - 2.9 * s - 1.225 * s]) { ctx.beginPath(); ctx.arc(x, 3.05 * s + 1.225 * s, 1.225 * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // inner shadow rims around the cutouts
  ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.lineWidth = 0.1 * s;
  roundRect(ctx, W / 2 - 3.85 * s, 3.4 * s, 7.7 * s, 1.75 * s, 2 * s); ctx.stroke();
  for (const x of [2.9 * s + 1.225 * s, W - 2.9 * s - 1.225 * s]) { ctx.beginPath(); ctx.arc(x, 3.05 * s + 1.225 * s, 1.225 * s, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  return { cardX: 1 * s, cardY: 9.5 * s, cardWpx: (cardW - 2) * s, cardHpx: (cardH - 9.5 - 2.3) * s };
}

function paintFront(d, photo) {
  const W = 1400, s = W / UNIT.cardW, H = Math.round(UNIT.cardH * s);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const { cardX, cardY, cardWpx, cardHpx } = paintHolder(ctx, s, W, H);
  // paper
  ctx.save();
  roundRect(ctx, cardX, cardY, cardWpx, cardHpx, 0.55 * s);
  ctx.fillStyle = '#fbfbfa'; ctx.shadowColor = 'rgba(0,0,0,0.14)'; ctx.shadowBlur = 0.7 * s; ctx.fill();
  ctx.restore();
  ctx.save(); roundRect(ctx, cardX, cardY, cardWpx, cardHpx, 0.55 * s); ctx.clip();
  // soft inner shadow
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.10)'; ctx.shadowBlur = 1.4 * s; ctx.lineWidth = 2 * s; ctx.strokeStyle = 'rgba(0,0,0,0)';
  ctx.beginPath(); ctx.roundRect(cardX - 1 * s, cardY - 1 * s, cardWpx + 2 * s, cardHpx + 2 * s, 0.55 * s); ctx.roundRect(cardX, cardY, cardWpx, cardHpx, 0.55 * s); ctx.fillStyle = 'rgba(0,0,0,0.001)'; ctx.fill('evenodd'); ctx.restore();
  // grain
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  for (let i = 0; i < 9000; i++) ctx.fillRect(cardX + Math.random() * cardWpx, cardY + Math.random() * cardHpx, 1.5, 1.5);
  // content box
  const padL = 3.6 * s, padR = 2 * s, padT = 3.8 * s, padB = 3 * s;
  const cx0 = cardX + padL, cx1 = cardX + cardWpx - padR, cy0 = cardY + padT, cy1 = cardY + cardHpx - padB;
  const innerW = cx1 - cx0;
  // name
  const fontFor = (px, w = 600, it = false) => `${it ? 'italic ' : ''}${w} ${px}px Gelasio, Georgia, serif`;
  ctx.font = fontFor(100); const wFirst = ctx.measureText(d.first).width, wLast = ctx.measureText(d.last).width;
  const fs = Math.min(100 * (innerW * 0.96) / Math.max(wFirst, wLast), 6.4 * s);
  ctx.font = fontFor(fs); ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = `${-0.025 * fs}px`;
  const nameTop = cy0 + 0.6 * s;
  ctx.fillStyle = '#080808'; ctx.fillText(d.first, cx0, nameTop + 0.75 * fs);
  ctx.fillStyle = d.lastColor; ctx.fillText(d.last, cx0, nameTop + 1.55 * fs);
  ctx.letterSpacing = '0px';
  const nameH = 0.6 * s + 1.6 * fs;
  // meta block metrics
  const lbl = 1.15 * s, chipFs = 1.05 * s, lineH = 1.3;
  const metaH = lbl * lineH + 0.55 * s + lbl * lineH + 1.6 * s + lbl * lineH + 0.55 * s + (chipFs * 1.2 + 0.37 * s);
  const photoW = 15.5 * s, photoH = 19.4 * s;
  const free = (cy1 - cy0) - nameH - photoH - metaH, gap = Math.max(0.6 * s, free / 2);
  // photo
  const px = cardX + (cardWpx - photoW) / 2, py = cy0 + nameH + gap;
  ctx.save(); roundRect(ctx, px, py, photoW, photoH, 0.7 * s); ctx.fillStyle = '#ddd'; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 0.5 * s; ctx.shadowOffsetY = 0.12 * s; ctx.fill(); ctx.restore();
  if (photo) {
    ctx.save(); roundRect(ctx, px, py, photoW, photoH, 0.7 * s); ctx.clip();
    const r = Math.max(photoW / photo.width, photoH / photo.height), dw = photo.width * r, dh = photo.height * r;
    ctx.drawImage(photo, px + (photoW - dw) / 2, py + (photoH - dh) / 2, dw, dh); ctx.restore();
  }
  // meta
  let y = py + photoH + gap;
  ctx.fillStyle = '#080808';
  ctx.font = fontFor(lbl, 500, true); ctx.fillText(d.nowLabel, cx0, y + lbl * 0.95); y += lbl * lineH + 0.55 * s;
  ctx.font = fontFor(lbl, 500); ctx.fillText(d.now, cx0, y + lbl * 0.95); y += lbl * lineH + 1.6 * s;
  ctx.font = fontFor(lbl, 500, true); ctx.fillText(d.thenLabel, cx0, y + lbl * 0.95); y += lbl * lineH + 0.55 * s;
  ctx.font = fontFor(chipFs, 500);
  let x = cx0; const chipH = chipFs * 1.2 + 0.37 * s;
  for (const ch of d.chips) {
    const tw = ctx.measureText(ch.text).width, cw = tw + 1.4 * s;
    if (x + cw > cx1) { x = cx0; y += chipH + 0.5 * s; }
    roundRect(ctx, x, y, cw, chipH, chipH / 2); ctx.fillStyle = ch.color || '#101010'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(ch.text, x + 0.7 * s, y + chipH * 0.5 + chipFs * 0.36);
    x += cw + 0.5 * s;
  }
  ctx.restore();
  return c;
}

function paintBack() {
  const W = 1400, s = W / UNIT.cardW, H = Math.round(UNIT.cardH * s);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const { cardX, cardY, cardWpx, cardHpx } = paintHolder(ctx, s, W, H);
  ctx.save(); roundRect(ctx, cardX, cardY, cardWpx, cardHpx, 0.55 * s); ctx.fillStyle = '#f7f7f5'; ctx.fill(); ctx.restore();
  // mirrored so it reads correctly when the card turns around
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
  ctx.fillStyle = '#1400ff'; roundRect(ctx, W / 2 - 4 * s, cardY + 16 * s, 8 * s, 8 * s, 1.6 * s); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `600 ${5.6 * s}px Gelasio, Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('H', W / 2, cardY + 20.1 * s);
  ctx.fillStyle = '#5b5864'; ctx.font = `500 ${1.2 * s}px Gelasio, Georgia, serif`;
  ctx.fillText('harshit2807161.github.io', W / 2, cardY + 28 * s);
  ctx.fillStyle = '#9a98a4'; ctx.font = `500 ${0.95 * s}px Gelasio, Georgia, serif`;
  ctx.fillText('If found, please return to the nearest GPU.', W / 2, cardY + cardHpx - 4 * s);
  ctx.restore();
  return c;
}
