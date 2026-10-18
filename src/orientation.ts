import { onLocaleChange, t } from './i18n';
import { h } from './ui/dom';

/** Пока телефон держат вертикально — поверх игры заглушка «поверните устройство» (показ — через CSS по ориентации). */
export function installOrientationGuard(): void {
  const title = h('div', { class: 'rot-title' });
  const text = h('div', { class: 'rot-text' });
  const el = h('div', { class: 'rotate-guard' }, h('div', { class: 'rot-icon', text: '📱' }), title, text);
  const fill = (): void => {
    title.textContent = t('rotate.title');
    text.textContent = t('rotate.text');
  };
  fill();
  onLocaleChange(fill);
  document.body.append(el);
}

/** Запрет масштабирования страницы жестами (двойной тап, щипок, iOS gesture*), чтобы игра не «уезжала» из-за случайного зума. */
export function lockPageZoom(): void {
  const stop = (e: Event): void => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.cancelable && e.preventDefault(), { passive: false });
  let lastEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      // второй тап быстрее 350 мс — это двойное касание: на нём браузер приближает страницу
      if (now - lastEnd < 350 && e.cancelable && !(e.target as HTMLElement).closest('input,textarea,select')) e.preventDefault();
      lastEnd = now;
    },
    { passive: false },
  );
  // ctrl + колесо / ctrl +/- в браузере
  window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
  window.addEventListener('keydown', (e) => (e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key) && e.preventDefault());
}
