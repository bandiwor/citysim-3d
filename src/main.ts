import { registerPwa } from './pwa';

// Лёгкая точка входа: экран загрузки лежит в index.html, а игра и three.js подгружаются отдельными чанками асинхронно.
const splash = document.getElementById('boot');
const msg = splash?.querySelector('.boot-msg');
if (msg) msg.textContent = /^ru/i.test(navigator.language) ? 'Загрузка…' : 'Loading…';

registerPwa();

void import('./app')
  .then((m) => {
    splash?.classList.add('done');
    setTimeout(() => splash?.remove(), 500);
    return m.boot();
  })
  .catch((err) => {
    console.error(err);
    if (msg) msg.textContent = '⚠ ' + (err instanceof Error ? err.message : String(err));
    splash?.classList.add('failed');
  });
