import { defineConfig, type Plugin } from 'vite';
import { collectOwnNames } from './scripts/ownNames.mjs';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/** Кладёт рядом с js/css/html готовые .gz и .br версии (для nginx `gzip_static` / `brotli_static`). */
function precompress(): Plugin {
  return {
    name: 'precompress',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [name, file] of Object.entries(bundle)) {
        if (!/\.(js|css|html|svg|json)$/.test(name)) continue;
        const source = file.type === 'chunk' ? file.code : file.source;
        const buf = Buffer.from(source);
        this.emitFile({ type: 'asset', fileName: `${name}.gz`, source: gzipSync(buf, { level: 9 }) });
        this.emitFile({
          type: 'asset',
          fileName: `${name}.br`,
          source: brotliCompressSync(buf, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length },
          }),
        });
      }
    },
  };
}

const ownNames = process.env.NO_OWN_MANGLE ? ['__none__'] : collectOwnNames();

export default defineConfig(({ mode }) => ({
  base: './',
  // Воркер собирается отдельным бандлом с теми же настройками минификации (см. terserOptions)
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    minify: 'terser',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    // Один чанк: мангл свойств должен быть согласованным во всём бандле.
    rollupOptions: { output: { manualChunks: undefined } },
    terserOptions: {
      ecma: 2022,
      toplevel: true,
      module: true,
      compress: {
        passes: 3,
        drop_console: mode === 'production',
        drop_debugger: true,
        pure_getters: true,
        hoist_funs: true,
      },
      mangle: {
        toplevel: true,
        // Укорачиваются: все `_`-члены (private в TS) и публичные члены классов проекта, которые не пересекаются
        // с данными (ключи объектов/интерфейсов, строки) и с three.js (см. scripts/ownNames.mjs).
        properties: {
          regex: new RegExp(`^(?:_|${ownNames.join('|')})`.replace('(?:_|', '(?:_.*|') + '$'),
          reserved: ['__proto__', '__esModule'],
        },
      },
      format: { comments: false, ecma: 2022 },
    },
  },
  plugins: [precompress()],
}));
