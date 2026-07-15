export function isPwaSupported() {
  return 'serviceWorker' in navigator;
}

export async function registrarServiceWorker() {
  if (!isPwaSupported()) {
    return null;
  }

  return navigator.serviceWorker.register('/sw.js');
}

export function urlBase64ParaUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
