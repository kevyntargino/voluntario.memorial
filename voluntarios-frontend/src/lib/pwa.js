export function isPwaSupported() {
  return 'serviceWorker' in navigator;
}

export async function registrarServiceWorker() {
  if (!isPwaSupported()) {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');

  const solicitarSincronizacao = () => sincronizarFilaOffline(registration).catch(() => {
    // A sincronização offline não deve bloquear o carregamento do app.
  });

  window.addEventListener('online', solicitarSincronizacao);
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'MCOM_OFFLINE_QUEUE_SYNCED') {
      window.dispatchEvent(new CustomEvent('mcom-offline-sync', {
        detail: {
          synced: event.data.synced || 0,
        },
      }));
    }
  });

  if (navigator.onLine) {
    solicitarSincronizacao();
  }

  return registration;
}

export async function sincronizarFilaOffline(registration) {
  if (!isPwaSupported()) {
    return;
  }

  const serviceWorkerRegistration = registration || await navigator.serviceWorker.ready;

  if ('sync' in serviceWorkerRegistration) {
    await serviceWorkerRegistration.sync.register('mcom-sync-offline-queue').catch(() => {});
  }

  const worker = serviceWorkerRegistration.active
    || serviceWorkerRegistration.waiting
    || serviceWorkerRegistration.installing
    || navigator.serviceWorker.controller;

  worker?.postMessage({ type: 'MCOM_SYNC_OFFLINE_QUEUE' });
}

export function urlBase64ParaUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
