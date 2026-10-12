/* Char & Oak service worker: caches the APP SHELL ONLY.
   Never caches or even touches API traffic (script.google.com / googleusercontent.com), and never
   stores a URL with a query string, so a ?k= token can never land in the cache. */
var CACHE = 'choak-shell-v6';
var SHELL = ['./', 'index.html', 'app.css', 'boot.js', 'install.js', 'install.css', 'config.js', 'core.js', 'demo.js', 'app.js',
  'manifest.webmanifest', 'fonts/manrope-latin.woff2', 'fonts/cormorant.woff2', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/logo-160.png', 'icons/logo-720.png', 'icons/logo-print.png', 'icons/wood.jpg', 'fonts/pirata.woff2', 'fonts/cinzel.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;     // API + everything off-site: not ours
  var scope = new URL(self.registration.scope);
  if (url.pathname.indexOf(scope.pathname) !== 0) return;
  if (req.mode === 'navigate') {
    // Network first for the page; offline fallback to the cached shell. Never cache the navigation URL itself.
    e.respondWith(fetch(req).catch(function () { return caches.match('index.html'); }));
    return;
  }
  var rel = url.pathname.slice(scope.pathname.length);
  if (url.search || SHELL.indexOf(rel) < 0) return;
  // Shell files: network first (fresh code), cache fallback; update cache with the clean URL only.
  e.respondWith(fetch(req).then(function (r) {
    if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(rel, copy); }); }
    return r;
  }).catch(function () { return caches.match(rel); }));
});
