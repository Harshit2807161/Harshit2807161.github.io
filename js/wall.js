// Skills wall: five rows of cards that roll forever. Under a mouse the wall becomes a lens: the card
// beneath the cursor swells and its neighbours swell less and ease outward, like a magnifying glass.
// Everything is driven by hover. Each pointer move writes the new targets straight away and CSS
// transitions carry the motion, so it stays responsive even where animation frames are throttled.
(function () {
  var wall = document.querySelector('.wall');
  if (!wall) return;
  var rows = [].slice.call(wall.querySelectorAll('.wrow'));
  var bands = [];

  function resetCard(c) {
    var st = c.el.style;
    st.transform = ''; st.zIndex = ''; st.willChange = ''; st.removeProperty('--m');
    c.g = 0; c.tx = 0; c.ty = 0; c.z = '';
  }
  function build() {
    var need = wall.clientWidth * 1.7;                       // the grid is wider than the panel and keeps moving
    rows.forEach(function (row, i) {
      [].slice.call(row.querySelectorAll('[data-clone]')).forEach(function (n) { n.remove(); });
      var base = [].slice.call(row.children);
      base.forEach(function (el) { resetCard({ el: el }); }); row.style.zIndex = '';
      var clone = function (n) { var c = n.cloneNode(true); c.setAttribute('data-clone', ''); c.setAttribute('aria-hidden', 'true'); return c; };
      while (row.scrollWidth < need) base.forEach(function (n) { row.appendChild(clone(n)); });
      [].slice.call(row.children).forEach(function (n) { row.appendChild(clone(n)); });   // second copy: the seam of the loop
      var half = row.scrollWidth / 2, speed = +row.getAttribute('data-speed') || 28;
      row.style.setProperty('--dur', (half / speed).toFixed(1) + 's');
      row.style.setProperty('--dir', i % 2 ? 'reverse' : 'normal');
      row.style.animationDelay = (-(i * 7.3)) + 's';                                      // rows start out of phase
    });
    bands = rows.map(function (row) {
      return { row: row, z: '', cards: [].slice.call(row.children).map(function (el) { return { el: el, g: 0, tx: 0, ty: 0, z: '' }; }) };
    });
  }

  // ---- the lens ----
  var AMP = 0.42, SIGMA = 1.3, PUSH = 0.85;   // peak swell, lens radius in card widths, how far neighbours slide outward
  var ptr = null;
  function translateOf(el) {                 // the translate a card is at right now, mid-transition included
    var t = getComputedStyle(el).transform;
    if (!t || t === 'none') return [0, 0];
    var m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return [0, 0];
    var v = m[1].split(',');
    return [parseFloat(v[4]) || 0, parseFloat(v[5]) || 0];
  }
  function apply(x, y) {
    var cw = bands[0] && bands[0].cards[0] ? bands[0].cards[0].el.offsetWidth : 100;
    var sigma = SIGMA * cw, twoSig2 = 2 * sigma * sigma, reach = 2.6 * sigma;
    bands.forEach(function (band) {
      var rr = band.row.getBoundingClientRect();
      var near = Math.abs(rr.top + rr.height / 2 - y) < reach + rr.height / 2;
      // read pass: rects and current translates, before any write
      var reads = near ? band.cards.map(function (c) { var r = c.el.getBoundingClientRect(); var tr = c.g ? translateOf(c.el) : [0, 0]; return [r.left + r.width / 2 - tr[0], r.top + r.height / 2 - tr[1], r.width]; }) : null;
      var rowMax = 0;
      band.cards.forEach(function (c, i) {
        var g = 0, dx = 0, dy = 0;
        if (near && reads[i][2]) {
          dx = reads[i][0] - x; dy = reads[i][1] - y;
          var d2 = dx * dx + dy * dy;
          if (d2 <= twoSig2 * 4) g = Math.exp(-d2 / twoSig2);
        }
        if (g < 0.02) { if (c.g) resetCard(c); return; }
        var push = AMP * PUSH * g, tx = dx * push, ty = dy * push * 0.7;   // rows sit tighter than columns, so spread less vertically
        if (g > rowMax) rowMax = g;
        if (Math.abs(g - c.g) < 0.004 && Math.abs(tx - c.tx) < 0.3 && Math.abs(ty - c.ty) < 0.3) return;
        var st = c.el.style, was = c.g;
        c.g = g; c.tx = tx; c.ty = ty;
        st.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + (1 + AMP * g).toFixed(4) + ')';
        var z = String(100 + Math.round(g * 100));
        if (z !== c.z) { c.z = z; st.zIndex = z; }
        st.setProperty('--m', g.toFixed(3));
        if (!was) st.willChange = 'transform';
      });
      var z = rowMax > 0 ? String(100 + Math.round(rowMax * 100)) : '';
      if (band.z !== z) { band.z = z; band.row.style.zIndex = z; }
    });
  }
  function release() {
    ptr = null;
    bands.forEach(function (band) { band.cards.forEach(function (c) { if (c.g) resetCard(c); }); if (band.z) { band.z = ''; band.row.style.zIndex = ''; } });
    wall.classList.remove('lens');
  }

  // at most one pass every ~12 ms, with a trailing pass so the last position always lands
  var lastAt = 0, trailing = 0;
  function run() {
    var now = performance.now();
    if (now - lastAt >= 12) { lastAt = now; if (ptr) apply(ptr.x, ptr.y); }
    else if (!trailing) trailing = setTimeout(function () { trailing = 0; lastAt = performance.now(); if (ptr) apply(ptr.x, ptr.y); }, 12 - (now - lastAt));
  }
  var lastTouch = 0;
  function onMove(e) {
    if (e.pointerType === 'touch' || (e.type === 'mousemove' && performance.now() - lastTouch < 1000)) return;
    ptr = { x: e.clientX, y: e.clientY };
    if (!wall.classList.contains('lens')) wall.classList.add('lens');
    run();
  }
  wall.addEventListener('pointermove', onMove, { passive: true });
  wall.addEventListener('mousemove', onMove, { passive: true });
  wall.addEventListener('pointerleave', release);
  wall.addEventListener('mouseleave', release);
  addEventListener('touchstart', function () { lastTouch = performance.now(); }, { passive: true });
  addEventListener('scroll', function () {
    if (!ptr) return;
    var el = document.elementFromPoint(ptr.x, ptr.y);          // the wall may have scrolled out from under a resting cursor
    if (!el || !wall.contains(el)) release(); else run();
  }, { passive: true });

  build();
  var timer, lastW = wall.clientWidth;
  addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { if (wall.clientWidth !== lastW) { lastW = wall.clientWidth; release(); build(); } }, 200);
  });
})();
