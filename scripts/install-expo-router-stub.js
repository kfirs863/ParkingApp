#!/usr/bin/env node
/**
 * Install expo-router stub into node_modules as a real directory (not a symlink).
 *
 * Why: Expo SDK 54's Metro web export invokes expo-router/node/render.js via
 * Server._resolveRelativePath, which cannot traverse npm's `file:` symlinks on
 * CI (Linux runners). Copying the stub into a real node_modules/expo-router/
 * directory sidesteps the symlink issue while keeping the stub source in the
 * repo at shims/expo-router-stub/.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'shims', 'expo-router-stub');
const TARGET = path.resolve(__dirname, '..', 'node_modules', 'expo-router');

function rmrf(p) {
  if (!fs.existsSync(p) && !fs.lstatSync(p, { throwIfNoEntry: false })) return;
  const stat = fs.lstatSync(p);
  if (stat.isSymbolicLink() || stat.isFile()) {
    fs.unlinkSync(p);
    return;
  }
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(SOURCE)) {
  console.warn(`[expo-router-stub] Source missing: ${SOURCE}`);
  process.exit(0);
}

try {
  if (fs.existsSync(TARGET) || fs.lstatSync(TARGET, { throwIfNoEntry: false })) {
    rmrf(TARGET);
  }
} catch (_) {}

copyDir(SOURCE, TARGET);
console.log(`[expo-router-stub] Installed stub at ${TARGET}`);
