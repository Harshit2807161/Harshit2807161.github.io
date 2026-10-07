// Skills wall: five rows of cards that roll forever. Under a mouse the wall becomes a lens: the card
// beneath the cursor swells and its neighbours swell less and ease outward, like a magnifying glass
// held over the wall. Everything is driven by hover; there is nothing to click.
(function () {
  var wall = document.querySelector('.wall');
  if (!wall) return;
  var rows = [].slice.call(wall.querySelectorAll('.wrow'));
  var bands = [];
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function resetCard(el) {
    var st = el.style;
    st.transform = ''; st.zIndex = ''; st.willChange = ''; st.removeProperty('--m');
  }
  function build() {
    var need = wall.clientWidth * 1.7;                       // the grid is wider than the panel and keeps moving
    rows.forEach(function (row, i) {
      [].slice.call(row.querySelectorAll('[data-clone]')).forEach(function (n) { n.remove(); });
      var base = [].slice.call(row.children);
      base.forEach(resetCard); row.style.zIndex = '';
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
  var ptr = null, dirty = false, raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.25, (now - last) / 1000) : 1 / 60; last = now;
    var k = 1 - Math.exp(-dt / 0.075);                     // time-based easing: the same feel at any frame rate
    var cw = bands[0] && bands[0].cards[0] ? bands[0].cards[0].el.offsetWidth : 100;
    var sigma = SIGMA * cw, twoSig2 = 2 * sigma * sigma, reach = 2.6 * sigma;
    var moving = false, pointerMoved = dirty; dirty = false;
    bands.forEach(function (band) {
      // read pass: only rows within reach of the lens are measured
      var near = false;
      if (ptr) { var rr = band.row.getBoundingClientRect(); near = Math.abs(rr.top + rr.height / 2 - ptr.y) < reach + rr.height / 2; }
      var targets = band.cards.map(function (c) {
        if (!near) return c.g ? [0, 0, 0] : null;
        var r = c.el.getBoundingClientRect();
        if (!r.width) return null;
        var dx = (r.left + r.width / 2 - c.tx) - ptr.x, dy = (r.top + r.height / 2 - c.ty) - ptr.y, d2 = dx * dx + dy * dy;
        if (d2 > twoSig2 * 4) return c.g ? [0, 0, 0] : null;
        return [Math.exp(-d2 / twoSig2), dx, dy];
      });
      // write pass
      var rowMax = 0;
      band.cards.forEach(function (c, i) {
        var t = targets[i];
        if (!t) return;
        var g = c.g + (t[0] - c.g) * k;
        if (Math.abs(g - t[0]) < 0.003) g = t[0];
        var push = AMP * PUSH * g, tx = t[1] * push, ty = t[2] * push * 0.7;   // rows sit tighter than columns, so spread less vertically
        if (g === c.g && Math.abs(tx - c.tx) < 0.2 && Math.abs(ty - c.ty) < 0.2) { if (g > rowMax) rowMax = g; return; }
        var was = c.g; c.g = g; c.tx = tx; c.ty = ty;
        var st = c.el.style, s = 1 + AMP * g;
        if (g === 0) { resetCard(c.el); c.tx = c.ty = 0; c.z = ''; }
        else {
          st.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
          var z = String(100 + Math.round(g * 100));
          if (z !== c.z) { c.z = z; st.zIndex = z; }                 // paint order only changes when the quantized depth does
          st.setProperty('--m', g < 0.02 ? '0' : g.toFixed(3));
          if (was === 0) st.willChange = 'transform';
        }
        moving = true;
        if (g > rowMax) rowMax = g;
      });
      var z = rowMax > 0 ? String(100 + Math.round(rowMax * 100)) : '';
      if (band.z !== z) { band.z = z; band.row.style.zIndex = z; }
    });
    if (moving || pointerMoved) raf = requestAnimationFrame(frame);     // keep going while anything is still easing
    else if (!ptr) { wall.classList.remove('lens'); last = 0; }
    else last = 0;                                                      // settled under a resting pointer: sleep until it moves
  }
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }
  function release() { if (!ptr) return; ptr = null; dirty = true; wake(); }
  wall.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch' || reduce.matches) return;
    ptr = { x: e.clientX, y: e.clientY }; dirty = true;
    wall.classList.add('lens');
    wake();
  });
  wall.addEventListener('pointerleave', release);
  addEventListener('scroll', function () {
    if (!ptr) return;
    var el = document.elementFromPoint(ptr.x, ptr.y);          // the wall may have scrolled out from under a resting cursor
    if (!el || !wall.contains(el)) release(); else { dirty = true; wake(); }
  }, { passive: true });

  build();
  var timer, lastW = wall.clientWidth;
  addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { if (wall.clientWidth !== lastW) { lastW = wall.clientWidth; ptr = null; wall.classList.remove('lens'); build(); } }, 200);
  });
})();
