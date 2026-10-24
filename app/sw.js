// Service Worker: speichert nur die App selbst und die Schriften (schneller Start,
// offline lesbar, installierbar). Messwerte gehen NIE über diesen Zwischenspeicher –
// der letzte Datenstand für den Offline-Start liegt in IndexedDB (js/speicher.js).
//
// Bei jeder Änderung an der App VERSION erhöhen (und APP_VERSION in js/version.js),
// sonst bekommen die Tablets die neue Version nicht.

const VERSION = '0.2.7';
const CACHE = 'seefisch-temperaturen-' + VERSION;

const DATEIEN = [
  './',
  './index.html',
  './seefisch.css',
  './temperatur.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './schriften/barlow-latin-400-normal.woff2',
  './schriften/barlow-latin-500-normal.woff2',
  './schriften/barlow-latin-600-normal.woff2',
  './schriften/barlow-condensed-latin-600-normal.woff2',
  './schriften/barlow-condensed-latin-700-normal.woff2',
  './js/main.js',
  './js/version.js',
  './js/zustand.js',
  './js/speicher.js',
  './js/rest.js',
  './js/daten.js',
  './js/zeit.js',
  './js/status.js',
  './js/icons.js',
  './js/bluetooth.js',
  './js/ansichten/uebersicht.js',
  './js/ansichten/detail.js',
  './js/ansichten/einstellungen.js',
  './js/ansichten/admin-status.js',
  './js/ansichten/admin.js',
  './js/ansichten/auslesen.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: 'reload' }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith('seefisch-temperaturen-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase/CDN nie anfassen
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then((treffer) => treffer || (e.request.mode === 'navigate' ? caches.match('./index.html') : null))
      .then((treffer) => treffer || fetch(e.request)));
});
