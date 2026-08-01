// Packs the built game into a distributable .love file (a zip with main.lua at
// its root). Run via `pnpm pack:love`, which builds first. Node strips the
// types natively — no tsx/ts-node needed.
import AdmZip from 'adm-zip';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const GAME_DIR = resolve('game');
const OUT_DIR = resolve('dist');
const OUT_FILE = resolve(OUT_DIR, 'spacedrift.love');

// TypeScript declaration output is useless to LÖVE; keep .lua(.map) and assets.
const EXCLUDE = /\.d\.ts$|\.d\.ts\.map$/;

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

// Ensure the build ran.
try {
  statSync(resolve(GAME_DIR, 'main.lua'));
} catch {
  console.error('game/main.lua not found — run `pnpm build` first.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const zip = new AdmZip();
for (const file of walk(GAME_DIR)) {
  if (EXCLUDE.test(file)) continue;
  // main.lua must sit at the archive root; subfolders (lib/, res/) preserved.
  // Zip paths use forward slashes on every OS.
  const rel = relative(GAME_DIR, file).split(sep).join('/');
  const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  zip.addLocalFile(file, folder);
}
zip.writeZip(OUT_FILE);

const { size } = statSync(OUT_FILE);
console.log(`Packed ${(size / 1024).toFixed(0)} KB -> ${OUT_FILE}`);
console.log('Run anywhere LÖVE 11.x is installed:  love dist/spacedrift.love');
