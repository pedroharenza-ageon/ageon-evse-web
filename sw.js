// Nome e versão do cache. MUDE A VERSÃO a cada nova atualização.
const cacheName = 'dashboard-v2'; // << ALTERADO para v2

// Arquivos que o app vai salvar para abrir rápido
const staticAssets = [
  './',
  './index.html',
  './manifest.json',
  './install-pwa.js'
  // Adicione aqui outros arquivos estáticos importantes (CSS, logos, etc.)
];

// --- 1. INSTALAÇÃO ---
// Instala o Service Worker, armazena os assets e se ativa imediatamente.
self.addEventListener('install', async e => {
  console.log('SW v2: Instalando...');
  const cache = await caches.open(cacheName);
  await cache.addAll(staticAssets);
  return self.skipWaiting(); // Ativa o novo SW sem esperar.
});

// --- 2. ATIVAÇÃO ---
// Assume o controle da página imediatamente e limpa caches antigos.
self.addEventListener('activate', e => {
  console.log('SW v2: Ativado e assumindo controle!');
  
  // Limpa todos os caches que não sejam o cache atual (cacheName).
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== cacheName)
        .map(key => caches.delete(key))
      );
    })
  );
  
  // Assume o controle das páginas abertas imediatamente.
  return self.clients.claim(); 
});

// --- 3. FETCH ---
// Intercepta as requisições. Serve do cache primeiro para máxima velocidade.
self.addEventListener('fetch', e => {
  // Ignora requisições que não são GET (ex: POST, etc.)
  if (e.request.method !== 'GET') {
    return;
  }

  e.respondWith(
    (async () => {
      // 1. Tenta pegar do cache primeiro (Estratégia "Cache First")
      const cachedResponse = await caches.match(e.request);
      if (cachedResponse) {
        // Se encontrou no cache, retorna imediatamente.
        return cachedResponse;
      }

      // 2. Se não encontrou no cache, busca na rede.
      try {
        const networkResponse = await fetch(e.request);
        // Opcional: Você pode adicionar a resposta da rede ao cache aqui se quiser
        // Ex: const cache = await caches.open(cacheName);
        //     cache.put(e.request, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        // Se a rede falhar, você pode retornar uma página de fallback offline
        console.log('Fetch falhou; o usuário está offline e o recurso não está no cache.', error);
        // return caches.match('/offline.html'); // (se você tiver uma)
      }
    })()
  );
});
