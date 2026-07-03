#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');
const { existsSync } = require('fs');

function resolveSkiaNodePath() {
  try {
    // skia-canvas/package.json is not exported, so resolve via the main entry
    // which lives in lib/index.js — skia.node is in the same lib/ directory
    const skiaLib = path.dirname(require.resolve('skia-canvas'));
    return path.join(skiaLib, 'skia.node');
  } catch {
    return null;
  }
}

function downloadSkiaBinary() {
  let prebuildScript;
  try {
    const skiaLib = path.dirname(require.resolve('skia-canvas'));
    prebuildScript = path.join(skiaLib, 'prebuild.mjs');
  } catch {
    return false;
  }
  console.error('[belt-charts] Native graphics library not found. Downloading now...');
  const result = spawnSync(process.execPath, [prebuildScript, 'download'], { stdio: 'inherit' });
  return result.status === 0;
}

// If skia.node is missing (e.g. npm install ran with --ignore-scripts),
// attempt to download it on first run before loading the main bundle.
const skiaNodePath = resolveSkiaNodePath();
if (skiaNodePath && !existsSync(skiaNodePath)) {
  const ok = downloadSkiaBinary();
  if (!ok) {
    console.error(
      '\nError: Failed to download the native graphics library for skia-canvas.\n' +
      'Check your internet connection and try reinstalling:\n' +
      '  npm install -g belt-charts\n'
    );
    process.exit(1);
  }
}

require('../dist/index.js');