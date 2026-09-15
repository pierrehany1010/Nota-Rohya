const cacheName = 'nota-rohya-cache-v1';
const assetsToCache = [
  '/',
  '/index.html',
  '/styles-main.css',
  '/script.js',
  '/pray-logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(cacheName).then(cache => cache.addAll(assetsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});