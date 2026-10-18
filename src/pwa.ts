/** Установка и обновление приложения (PWA): регистрация service worker, кнопка «Установить», уведомление об обновлении. */
declare const __PWA__: boolean;
declare const __BUILD__: string;

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const BUILD_LABEL: string = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

let deferred: InstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let updateReady = false;
let offlineReady = false;
let reloading = false;
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((f) => f());

export const pwa = {
  /** приложение можно установить (браузер разрешил) */
  get installable(): boolean {
    return deferred !== null;
  },
  /** запущено как установленное приложение */
  get standalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  },
  /** service worker поддерживается и включён в этой сборке */
  get supported(): boolean {
    return typeof __PWA__ !== 'undefined' && __PWA__ && 'serviceWorker' in navigator;
  },
  /** новая версия скачана и ждёт перезапуска */
  get updateReady(): boolean {
    return updateReady;
  },
  /** игра закэширована для работы без интернета */
  get offlineReady(): boolean {
    return offlineReady;
  },
  onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async install(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const r = await deferred.userChoice;
    deferred = null;
    notify();
    return r.outcome === 'accepted';
  },
  /** Ищет новую версию. 'ready' — найдена и скачана, 'none' — у вас последняя, 'error' — нет сети/не поддерживается. */
  async checkUpdate(): Promise<'ready' | 'none' | 'error'> {
    if (!registration) return 'error';
    try {
      await registration.update();
      // даём новому воркеру время скачать файлы
      for (let i = 0; i < 40 && !updateReady && registration.installing; i++) await new Promise((r) => setTimeout(r, 250));
      return updateReady ? 'ready' : 'none';
    } catch {
      return 'error';
    }
  },
  /** Активирует скачанную версию и перезагружает страницу. */
  applyUpdate(): void {
    const w = registration?.waiting;
    if (w) w.postMessage('skip');
    else location.reload();
  },
};

function watch(reg: ServiceWorkerRegistration): void {
  const track = (w: ServiceWorker): void => {
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') {
        if (navigator.serviceWorker.controller) updateReady = true;
        else offlineReady = true;
        notify();
      }
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) updateReady = true;
  if (reg.active && !navigator.serviceWorker.controller) offlineReady = true;
  if (reg.active && navigator.serviceWorker.controller) offlineReady = true;
  if (reg.installing) track(reg.installing);
  reg.addEventListener('updatefound', () => reg.installing && track(reg.installing));
}

/** Регистрирует service worker (только в production-сборке) и подписывается на события установки. */
export function registerPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  if (!pwa.supported || !import.meta.env.PROD) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      registration = reg;
      watch(reg);
      notify();
      // проверка обновлений раз в полчаса и при возвращении на вкладку
      setInterval(() => void reg.update().catch(() => {}), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('Service worker не зарегистрирован', err));
}
