// Nome do cache (pode ser qualquer nome)
const cacheName = 'dashboard-v1';

// Arquivos que o app vai salvar para abrir rápido
const staticAssets = [
  './',
  './index.html',
  './manifest.json'
];

// Instalando o Service Worker
self.addEventListener('install', async e => {
  const cache = await caches.open(cacheName);
  await cache.addAll(staticAssets);
  return self.skipWaiting();
});

// Fazendo o app funcionar mesmo se o servidor cair (usa o cache)
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});