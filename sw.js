// Incrementar VERSION quando qualquer recurso local do painel mudar.
const VERSION = '1.6.7';
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'ageon-evse-web:' + SCOPE.pathname + ':shell:';
const CACHE = PREFIX + VERSION;
const asset = name => new URL(name, SCOPE).href;
const FILES = [
    'index.html', 'offline.html', 'manifest.json', 'icon-192.png', 'icon-512.png',
    'screenshot-mobile.png', 'screenshot-desktop.png',
    'css/style.css', 'css/ota.css',
    'js/config.js', 'js/device-manager.js', 'js/utils.js', 'js/ui-manager.js',
    'js/main.js', 'js/script.js', 'js/install-pwa.js', 'js/sw-register.js',
    'js/mqtt-manager.js', 'js/mqtt-message-handler.js', 'js/ota-controller.js',
    'js/ota-panel.js', 'js/ota-protocol.js'
];
const ASSETS = new Set(FILES.map(asset));

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // addAll só conclui se o conjunto completo estiver disponível.
        await cache.addAll(FILES.map(file => new Request(asset(file), { cache: 'reload' })));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key.startsWith(PREFIX) && key !== CACHE) {
                await caches.delete(key);
            } else if (/^dashboard-v[0-9]+(?:\.[0-9]+)*$/.test(key)) {
                // Nomes antigos eram compartilhados na origem: remover só entradas deste projeto.
                const legacy = await caches.open(key);
                for (const request of await legacy.keys()) {
                    if (request.url.startsWith(SCOPE.href)) await legacy.delete(request);
                }
                if ((await legacy.keys()).length === 0) await caches.delete(key);
            }
        }
        await self.clients.claim();
    })());
});

function unavailable() {
    return new Response('Recurso indisponível sem conexão.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || !url.href.startsWith(SCOPE.href)) return;
    // Binários nunca consultam CacheStorage, cache HTTP ou fallback HTML.
    if (url.pathname.startsWith(SCOPE.pathname + 'firmware/')) {
        event.respondWith(fetch(new Request(request, { cache: 'no-store', redirect: 'error' })).catch(unavailable));
        return;
    }
    const navigation = request.mode === 'navigate' &&
        (url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.html');
    if (navigation) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            try {
                // Confirmar acesso à rede; usar o HTML do mesmo conjunto de JS/CSS instalado.
                const response = await fetch(new Request(request, { cache: 'no-store', signal: AbortSignal.timeout(15000) }));
                if (!response.ok) return response;
                return await cache.match(asset('index.html')) || response;
            } catch {
                return await cache.match(asset('offline.html')) || unavailable();
            }
        })());
        return;
    }
    if (ASSETS.has(url.href)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            return await cache.match(request) || fetch(request).catch(unavailable);
        })());
    }
    // Arquivos inexistentes, outras páginas/projetos e CDNs mantêm a resposta da rede.
});
