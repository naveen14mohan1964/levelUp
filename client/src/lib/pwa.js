// Installable app + desktop notifications (no push server: notifications come from the open app / its service worker).
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

let installEvent = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

/** Register the service worker (built app only, so Vite's dev server is never cached). */
export function registerPwa() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; emit(); });
  window.addEventListener('appinstalled', () => { installEvent = null; emit(); });
}

export const onPwaChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const canInstall = () => !!installEvent;
export const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || false;
export async function install() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  emit();
  return outcome === 'accepted';
}

export const notifySupported = () => 'Notification' in window;
export const notifyEnabled = () => notifySupported() && Notification.permission === 'granted' && read('levelup:notify') !== '0';
export async function enableNotify() {
  if (!notifySupported()) return false;
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  save('levelup:notify', p === 'granted' ? '1' : '0');
  emit();
  return p === 'granted';
}
export function disableNotify() { save('levelup:notify', '0'); emit(); }

/** Show a desktop notification (through the service worker when there is one, so a click focuses the app). */
export async function notify(title, body, { url = '/', tag } = {}) {
  if (!notifyEnabled()) return;
  const opts = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch { /* blocked by the OS: fine */ }
}

/** Once per local day per key (so a reminder never repeats after a reload). */
export function oncePerDay(key, day) {
  if (read(`levelup:once:${key}`) === day) return false;
  save(`levelup:once:${key}`, day);
  return true;
}
