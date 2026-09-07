'use strict';

// Bundles the framework-free engine (../app/preview.js + editor-model.js)
// into ESM the Vite app can import. The engine files stay untouched CJS
// (jest still requires them); this runs via predev/prebuild.
const esbuild = require('esbuild');
const path = require('path');

const root = __dirname;
esbuild.buildSync({
  entryPoints: {
    engine: path.join(root, '..', '..', 'app', 'editor-model.js'),
    preview: path.join(root, '..', '..', 'app', 'preview.js'),
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outdir: path.join(root, '..', 'src', 'gen'),
  logLevel: 'info',
});
