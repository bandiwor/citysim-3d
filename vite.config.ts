import { defineConfig, type Plugin } from 'vite';
import { collectOwnNames } from './scripts/ownNames.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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

/** Service worker для офлайна: список файлов сборки и хеш-версия подставляются после сборки. */
function pwa(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pwa-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      if (!existsSync(outDir)) return;
      const files: string[] = [];
      const walk = (d: string): void => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (!/\.(gz|br|map)$/.test(f) && f !== 'sw.js') files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      files.sort();
      const hash = createHash('sha1');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 10);
      const assets = ['./', ...files.map((f) => './' + f)];
      const sw = readFileSync('scripts/swTemplate.js', 'utf8').replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  // Воркер собирается отдельным бандлом с теми же настройками минификации (см. terserOptions)
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    minify: 'terser',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    // SINGLE_FILE=1: один JS без чанков (для встраивания в одну HTML-страницу)
    outDir: process.env.SINGLE_FILE ? 'dist-single' : 'dist',
    // Библиотеки (three.js) — отдельный чанк; точка входа крошечная и подгружает игру асинхронно (экран загрузки в index.html).
    rollupOptions: { output: process.env.SINGLE_FILE ? { inlineDynamicImports: true } : { manualChunks: (id: string) => (id.includes('node_modules') ? 'vendor' : undefined) } },
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
  define: { __PWA__: JSON.stringify(!process.env.SINGLE_FILE), __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: process.env.SINGLE_FILE ? [] : [precompress(), pwa()],
}));
