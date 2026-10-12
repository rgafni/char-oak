/* Runs first (in <head>, before any other request is made with a Referer). 
   1) Take ?k=<token> once, keep it in localStorage, strip it from the address bar.
   2) Phone fit: Android Chrome "Desktop site" ignores the viewport meta and lays the page out at ~980px,
      which made everything tiny. If a touch phone gets a desktop-width layout, zoom to the real width.
   3) Mark wide screens (by EFFECTIVE width, after any zoom) for the two-pane desktop layout. */
(function () {
  try {
    // Preferred link form is #k=<token>: a URL fragment is never sent to the server, so it can't land in server logs.
    var u = new URL(location.href), k = u.searchParams.get('k'), hm = /^#k=([A-Za-z0-9_-]{20,128})$/.exec(u.hash);
    if (hm) { k = hm[1]; u.hash = ''; }
    if (k) {
      if (/^[A-Za-z0-9_-]{20,128}$/.test(k)) { if (localStorage.getItem('choak.k') !== k) localStorage.removeItem('choak.cache'); localStorage.setItem('choak.k', k); }
      u.searchParams.delete('k');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  } catch (e) {}
  var de = document.documentElement;
  function fit() {
    try {
      de.style.zoom = '';
      var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      var land = window.innerWidth > window.innerHeight;
      var sw = land ? Math.max(screen.width || 0, screen.height || 0) : Math.min(screen.width || 0, screen.height || 0);
      var w = window.innerWidth, z = 1;
      if (touch && sw && sw < 700 && w > sw * 1.4) { z = Math.round((w / sw) * 100) / 100; de.style.zoom = String(z); }
      de.classList.toggle('wide', w / z >= 960);
      de.classList.toggle('fitted', z !== 1);
    } catch (e) {}
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });
})();
