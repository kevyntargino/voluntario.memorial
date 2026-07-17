const SHELL_CACHE = 'mcom-shell-v3';
const STATIC_CACHE = 'mcom-static-v1';
const API_CACHE = 'mcom-api-v1';
const FILE_CACHE = 'mcom-files-v1';
const EXPECTED_CACHES = [SHELL_CACHE, STATIC_CACHE, API_CACHE, FILE_CACHE];
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons.svg',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
];

const API_CACHE_PREFIX = '/__mcom_api_cache__/';
const OFFLINE_QUEUE_DB = 'mcom-offline-queue';
const OFFLINE_QUEUE_STORE = 'requests';
const OFFLINE_QUEUE_VERSION = 1;
const OFFLINE_SYNC_TAG = 'mcom-sync-offline-queue';
const MAX_API_CACHE_ENTRIES = 180;
const MAX_FILE_CACHE_ENTRIES = 80;
const MAX_STATIC_CACHE_ENTRIES = 120;

let syncInProgress = null;

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStreamRequest(request, url) {
  return url.pathname === '/api/notificacoes/stream'
    || request.headers.get('Accept')?.includes('text/event-stream');
}

function isApiFileRequest(url) {
  return /^\/api\/manuais\/[^/]+\/arquivo$/.test(url.pathname)
    || /^\/api\/ordens-culto\/[^/]+\/arquivo$/.test(url.pathname)
    || url.pathname.startsWith('/api/auth/fotos/');
}

function isQueueableMutation(request, url) {
  if (!request.headers.has('Authorization')) {
    return false;
  }

  if (request.method !== 'PATCH') {
    return false;
  }

  const contentType = request.headers.get('Content-Type') || '';
  const hasJsonBody = !contentType || contentType.includes('application/json');

  if (!hasJsonBody) {
    return false;
  }

  return /^\/api\/avisos\/[^/]+\/visualizar$/.test(url.pathname)
    || /^\/api\/notificacoes\/[^/]+\/visualizar$/.test(url.pathname)
    || url.pathname === '/api/notificacoes/visualizar-todas'
    || /^\/api\/escalas\/[^/]+\/status$/.test(url.pathname);
}

function offlineJsonResponse(message, status = 503) {
  return new Response(JSON.stringify({
    erro: message,
    offline: true,
  }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function queuedJsonResponse() {
  return new Response(JSON.stringify({
    mensagem: 'Alteração salva offline. Ela será sincronizada quando a conexão voltar.',
    offline: true,
    queued: true,
  }), {
    status: 202,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function hashAuthScope(request) {
  const authorization = request.headers.get('Authorization') || '';

  if (!authorization) {
    return 'public';
  }

  if (self.crypto?.subtle && self.TextEncoder) {
    const bytes = new TextEncoder().encode(authorization);
    const digest = await self.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  }

  let hash = 0;
  for (let index = 0; index < authorization.length; index += 1) {
    hash = ((hash << 5) - hash) + authorization.charCodeAt(index);
    hash |= 0;
  }

  return `legacy-${authorization.length}-${Math.abs(hash)}`;
}

async function createApiCacheKey(request) {
  const scope = await hashAuthScope(request);
  const keyUrl = new URL(`${API_CACHE_PREFIX}${scope}`, self.location.origin);
  keyUrl.searchParams.set('url', request.url);

  return new Request(keyUrl.toString(), { method: 'GET' });
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;

  if (excess <= 0) {
    return;
  }

  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, OFFLINE_QUEUE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        const store = db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withQueueStore(mode, callback) {
  const db = await openQueueDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_QUEUE_STORE, mode);
    const store = transaction.objectStore(OFFLINE_QUEUE_STORE);
    let result;

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };

    result = callback(store);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getSerializableHeaders(request) {
  const headers = {};

  request.headers.forEach((value, key) => {
    if (!['content-length', 'host'].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  return headers;
}

async function enqueueMutation(request) {
  const clone = request.clone();
  const body = await clone.text();
  const queuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: clone.url,
    method: clone.method,
    headers: getSerializableHeaders(clone),
    body,
    credentials: clone.credentials,
    createdAt: Date.now(),
    attemptCount: 0,
  };

  await withQueueStore('readwrite', (store) => {
    store.put(queuedRequest);
  });
  applyQueuedMutationToApiCache(request, queuedRequest).catch(() => {});

  notifyClients({
    type: 'MCOM_OFFLINE_QUEUE_CHANGED',
    queued: true,
  });

  return queuedRequest;
}

async function getQueuedMutations() {
  const requests = await withQueueStore('readonly', (store) => requestToPromise(store.getAll()));

  return (requests || []).sort((a, b) => a.createdAt - b.createdAt);
}

async function deleteQueuedMutation(id) {
  await withQueueStore('readwrite', (store) => {
    store.delete(id);
  });
}

async function updateQueuedMutation(item) {
  await withQueueStore('readwrite', (store) => {
    store.put(item);
  });
}

function createReplayRequest(item) {
  return new Request(item.url, {
    method: item.method,
    headers: item.headers,
    body: item.body || undefined,
    credentials: item.credentials || 'same-origin',
    mode: 'cors',
  });
}

function getCachedApiUrlFromKey(cacheRequest, scope) {
  const keyUrl = new URL(cacheRequest.url);

  if (keyUrl.origin !== self.location.origin || !keyUrl.pathname.startsWith(`${API_CACHE_PREFIX}${scope}`)) {
    return null;
  }

  const cachedUrl = keyUrl.searchParams.get('url');
  return cachedUrl ? new URL(cachedUrl) : null;
}

function updateAvisosPayload(payload, avisoId, cachedUrl, agora) {
  if (!Array.isArray(payload?.avisos)) {
    return false;
  }

  let changed = false;
  const mostrarTodos = cachedUrl.searchParams.get('visualizados') === 'todos';

  payload.avisos = payload.avisos
    .map((aviso) => {
      if (aviso.id !== avisoId) {
        return aviso;
      }

      if (!aviso.visualizado && typeof payload.totalNaoVisualizados === 'number') {
        payload.totalNaoVisualizados = Math.max(0, payload.totalNaoVisualizados - 1);
      }

      changed = true;
      return {
        ...aviso,
        visualizado: true,
        visualizadoEm: aviso.visualizadoEm || agora,
      };
    })
    .filter((aviso) => mostrarTodos || aviso.id !== avisoId);

  return changed;
}

function updateNotificacoesPayload(payload, notificacaoId, agora) {
  if (!Array.isArray(payload?.notificacoes)) {
    return false;
  }

  let changed = false;

  payload.notificacoes = payload.notificacoes.map((notificacao) => {
    if (notificacao.id !== notificacaoId) {
      return notificacao;
    }

    if (!notificacao.visualizada && typeof payload.naoVisualizadas === 'number') {
      payload.naoVisualizadas = Math.max(0, payload.naoVisualizadas - 1);
    }

    changed = true;
    return {
      ...notificacao,
      visualizada: true,
      lidaEm: notificacao.lidaEm || agora,
    };
  });

  return changed;
}

function updateTodasNotificacoesPayload(payload, agora) {
  if (!Array.isArray(payload?.notificacoes)) {
    return false;
  }

  payload.notificacoes = payload.notificacoes.map((notificacao) => ({
    ...notificacao,
    visualizada: true,
    lidaEm: notificacao.lidaEm || agora,
  }));
  payload.naoVisualizadas = 0;

  return true;
}

function updateEscalasPayload(payload, participacaoId, queuedRequest) {
  if (!Array.isArray(payload?.escalas)) {
    return false;
  }

  let dadosStatus = {};

  try {
    dadosStatus = queuedRequest.body ? JSON.parse(queuedRequest.body) : {};
  } catch {
    return false;
  }

  if (!dadosStatus.status) {
    return false;
  }

  let changed = false;
  const substituicao = dadosStatus.status === 'PEDIU_SUBSTITUICAO';

  payload.escalas = payload.escalas.map((escala) => {
    const atualizaParticipacao = (participacao) => {
      if (!participacao || participacao.id !== participacaoId) {
        return participacao;
      }

      changed = true;
      return {
        ...participacao,
        status: dadosStatus.status,
        justificativaSubstituicao: substituicao ? dadosStatus.justificativaSubstituicao : null,
        dataOcorrenciaSubstituicao: substituicao ? dadosStatus.dataOcorrencia : null,
      };
    };

    return {
      ...escala,
      minhaParticipacao: atualizaParticipacao(escala.minhaParticipacao),
      voluntarios: Array.isArray(escala.voluntarios)
        ? escala.voluntarios.map(atualizaParticipacao)
        : escala.voluntarios,
    };
  });

  return changed;
}

function mutateCachedPayload(payload, mutationUrl, cachedUrl, queuedRequest) {
  const agora = new Date().toISOString();
  const avisoMatch = mutationUrl.pathname.match(/^\/api\/avisos\/([^/]+)\/visualizar$/);
  const notificacaoMatch = mutationUrl.pathname.match(/^\/api\/notificacoes\/([^/]+)\/visualizar$/);
  const escalaMatch = mutationUrl.pathname.match(/^\/api\/escalas\/([^/]+)\/status$/);

  if (avisoMatch) {
    return updateAvisosPayload(payload, avisoMatch[1], cachedUrl, agora);
  }

  if (notificacaoMatch) {
    return updateNotificacoesPayload(payload, notificacaoMatch[1], agora);
  }

  if (mutationUrl.pathname === '/api/notificacoes/visualizar-todas') {
    return updateTodasNotificacoesPayload(payload, agora);
  }

  if (escalaMatch) {
    return updateEscalasPayload(payload, escalaMatch[1], queuedRequest);
  }

  return false;
}

async function applyQueuedMutationToApiCache(originalRequest, queuedRequest) {
  const scope = await hashAuthScope(originalRequest);
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  const mutationUrl = new URL(queuedRequest.url);

  await Promise.all(keys.map(async (cacheKey) => {
    const cachedUrl = getCachedApiUrlFromKey(cacheKey, scope);

    if (!cachedUrl) {
      return;
    }

    const response = await cache.match(cacheKey);
    const contentType = response?.headers.get('Content-Type') || '';

    if (!response || !contentType.includes('application/json')) {
      return;
    }

    const payload = await response.clone().json().catch(() => null);

    if (!payload || !mutateCachedPayload(payload, mutationUrl, cachedUrl, queuedRequest)) {
      return;
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('X-MCom-Offline-Updated', '1');

    await cache.put(cacheKey, new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    }));
  }));
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  clients.forEach((client) => {
    client.postMessage(message);
  });
}

async function flushOfflineQueue() {
  if (syncInProgress) {
    return syncInProgress;
  }

  syncInProgress = (async () => {
    const queuedMutations = await getQueuedMutations();
    let synced = 0;

    for (const item of queuedMutations) {
      try {
        const response = await fetch(createReplayRequest(item));

        if (response.ok || (response.status >= 400 && response.status < 500)) {
          await deleteQueuedMutation(item.id);
          synced += 1;
          continue;
        }

        await updateQueuedMutation({
          ...item,
          attemptCount: item.attemptCount + 1,
          lastAttemptAt: Date.now(),
          lastStatus: response.status,
        });
        break;
      } catch {
        await updateQueuedMutation({
          ...item,
          attemptCount: item.attemptCount + 1,
          lastAttemptAt: Date.now(),
        });
        break;
      }
    }

    if (synced > 0) {
      notifyClients({
        type: 'MCOM_OFFLINE_QUEUE_SYNCED',
        synced,
      });
    }
  })().finally(() => {
    syncInProgress = null;
  });

  return syncInProgress;
}

async function respondWithApiGet(request, url) {
  const cacheName = isApiFileRequest(url) ? FILE_CACHE : API_CACHE;
  const maxEntries = isApiFileRequest(url) ? MAX_FILE_CACHE_ENTRIES : MAX_API_CACHE_ENTRIES;
  const cacheKey = await createApiCacheKey(request);
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(cacheKey, response.clone())
        .then(() => trimCache(cacheName, maxEntries))
        .catch(() => {});
      flushOfflineQueue().catch(() => {});
      return response;
    }

    if ([401, 403].includes(response.status)) {
      cache.delete(cacheKey).catch(() => {});
      return response;
    }

    if (response.status >= 500) {
      const cached = await cache.match(cacheKey);

      if (cached) {
        return cached;
      }
    }

    return response;
  } catch {
    const cached = await cache.match(cacheKey);

    if (cached) {
      return cached;
    }

    return offlineJsonResponse('Sem conexão e sem dados salvos para esta informação.');
  }
}

async function respondWithQueueableMutation(request) {
  try {
    const response = await fetch(request.clone());

    if (response.ok) {
      flushOfflineQueue().catch(() => {});
    }

    return response;
  } catch {
    await enqueueMutation(request);
    registerBackgroundSync().catch(() => {});
    return queuedJsonResponse();
  }
}

async function respondWithNavigation(request) {
  try {
    const response = await fetch(request);

    if (!response.ok) {
      const cached = await caches.match('/');
      return cached || response;
    }

    const cache = await caches.open(SHELL_CACHE);
    cache.put('/', response.clone()).catch(() => {});
    return response;
  } catch {
    return caches.match('/')
      .then((cached) => cached || new Response('MCom offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }));
  }
}

async function respondWithStaticAsset(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone())
      .then(() => trimCache(STATIC_CACHE, MAX_STATIC_CACHE_ENTRIES))
      .catch(() => {});
  }

  return response;
}

async function registerBackgroundSync() {
  if ('sync' in self.registration) {
    await self.registration.sync.register(OFFLINE_SYNC_TAG);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !EXPECTED_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim())
      .then(() => flushOfflineQueue())
      .catch(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isApiRequest(url) && isStreamRequest(request, url)) {
    return;
  }

  if (request.method === 'GET' && isApiRequest(url)) {
    event.respondWith(respondWithApiGet(request, url));
    return;
  }

  if (isApiRequest(url) && isQueueableMutation(request, url)) {
    event.respondWith(respondWithQueueableMutation(request));
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(respondWithNavigation(request));
    return;
  }

  event.respondWith(respondWithStaticAsset(request));
});

self.addEventListener('sync', (event) => {
  if (event.tag === OFFLINE_SYNC_TAG) {
    event.waitUntil(flushOfflineQueue());
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'MCOM_SYNC_OFFLINE_QUEUE') {
    event.waitUntil(flushOfflineQueue());
  }
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: 'MCom',
      body: event.data?.text() || 'Você tem uma nova notificação.',
    };
  }

  const title = data.title || 'MCom';
  const options = {
    body: data.body || 'Você tem uma nova notificação.',
    icon: '/pwa-icons/icon-192.png',
    badge: '/pwa-icons/icon-192.png',
    tag: data.tag || data.notificationId || 'mcom-notification',
    data: {
      url: data.url || '/',
      notificationId: data.notificationId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin);
  const targetPath = `${targetUrl.pathname}${targetUrl.search}`;
  const bootUrl = new URL('/', self.location.origin);
  bootUrl.searchParams.set('mcom_open', targetPath);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const alvo = clients.find((client) => 'focus' in client);

    if (alvo) {
      // Janela já aberta: foca e pede navegação in-app (sem recarregar a página).
      alvo.postMessage({ type: 'MCOM_NAVIGATE', url: targetPath });

      try {
        await alvo.focus();
      } catch {
        // Alguns navegadores rejeitam focus() fora do gesto; a navegação já foi solicitada.
      }

      return;
    }

    // Nenhuma janela aberta: abre o app já apontando para o destino (deep-link a frio).
    await self.clients.openWindow(bootUrl.href);
  })());
});
