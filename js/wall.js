// Skills wall: five rows of cards that roll forever. Hover pulls a card forward; a click holds it,
// and the next click anywhere on the wall (or Escape) lets it go.
(function () {
  var wall = document.querySelector('.wall');
  if (!wall) return;
  var rows = [].slice.call(wall.querySelectorAll('.wrow'));

  function build() {
    var need = wall.clientWidth * 1.7;                       // the grid is wider than the panel and keeps moving
    rows.forEach(function (row, i) {
      [].slice.call(row.querySelectorAll('[data-clone]')).forEach(function (n) { n.remove(); });
      var base = [].slice.call(row.children);
      var clone = function (n) { var c = n.cloneNode(true); c.setAttribute('data-clone', ''); c.setAttribute('aria-hidden', 'true'); c.classList.remove('is-focus'); return c; };
      while (row.scrollWidth < need) base.forEach(function (n) { row.appendChild(clone(n)); });
      [].slice.call(row.children).forEach(function (n) { row.appendChild(clone(n)); });   // second copy: the seam of the loop
      var half = row.scrollWidth / 2, speed = +row.getAttribute('data-speed') || 28;
      row.style.setProperty('--dur', (half / speed).toFixed(1) + 's');
      row.style.setProperty('--dir', i % 2 ? 'reverse' : 'normal');
      row.style.animationDelay = (-(i * 7.3)) + 's';                                      // rows start out of phase
    });
  }

  function release() {
    var cur = wall.querySelector('.is-focus');
    if (cur) { cur.classList.remove('is-focus'); cur.parentNode.classList.remove('row-focus'); }
    wall.classList.remove('has-focus');
  }
  wall.addEventListener('click', function (e) {
    if (wall.classList.contains('has-focus')) { release(); return; }
    var card = e.target.closest('.skill');
    if (!card) return;
    card.classList.add('is-focus'); card.parentNode.classList.add('row-focus'); wall.classList.add('has-focus');
  });
  document.addEventListener('click', function (e) { if (!wall.contains(e.target)) release(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') release(); });

  build();
  var timer, lastW = wall.clientWidth;
  addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { if (wall.clientWidth !== lastW) { lastW = wall.clientWidth; release(); build(); } }, 200);
  });
})();
