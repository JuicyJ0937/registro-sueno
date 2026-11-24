// Service worker: guarda la app en el móvil para que abra sin conexión. Las llamadas al servidor no se tocan.
const VERSION = 'sm-14b2c663d6';
const ARCHIVOS = ['./', 'index.html', 'estilo.css', 'app.js', 'datos.js', 'derivar.js', 'manifest.webmanifest', 'icono.svg', 'icono-192.png', 'icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Red primero (para recibir actualizaciones), y si no hay conexión, la copia guardada
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
