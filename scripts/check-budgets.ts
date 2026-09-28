import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import type { Manifest } from 'vite';

// Compressed transfer budgets, including the separate physics binary.
const root = join(import.meta.dir, '..', 'dist');
const manifest: Manifest = await Bun.file(join(root, '.vite/manifest.json')).json();
const byFile = new Map(Object.values(manifest).map((chunk) => [chunk.file, chunk]));
const landing = new Set<string>();
function visit(file: string): void {
  if (landing.has(file)) return;
  landing.add(file);
  const chunk = byFile.get(file);
  for (const css of chunk?.css ?? []) landing.add(css);
  for (const dependency of chunk?.imports ?? []) visit(manifest[dependency].file);
}
// Both landing pages, Swedish and English. With two pages Vite leaves them out of its manifest, so read what they load.
for (const page of ['index.html', 'en/index.html']) {
  const html = await Bun.file(join(root, page)).text();
  const assets = [...html.matchAll(/(?:src|href)="(?:\.\.?\/)*(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  if (!assets.length) throw new Error(`No scripts or styles found in ${page}`);
  for (const file of assets) visit(file);
}

async function compressedBytes(paths: Iterable<string>): Promise<number> {
  let bytes = 0;
  for (const path of paths) bytes += Bun.gzipSync(new Uint8Array(await Bun.file(join(root, path)).arrayBuffer())).byteLength;
  return bytes;
}
/** What a host that speaks Brotli (Cloudflare does) sends at best, precompressed at quality 11. Shown for comparison; the budgets stay in gzip. */
async function brotliBytes(paths: Iterable<string>): Promise<number> {
  let bytes = 0;
  for (const path of paths) bytes += brotliCompressSync(new Uint8Array(await Bun.file(join(root, path)).arrayBuffer()), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength;
  return bytes;
}
const runtime: string[] = [];
for await (const path of new Bun.Glob('assets/*.{js,wasm}').scan(root)) runtime.push(path);
const budgets = [
  { name: 'Landing JavaScript', files: [...landing].filter((p) => p.endsWith('.js')), limit: 6_000 },
  { name: 'Landing CSS', files: [...landing].filter((p) => p.endsWith('.css')), limit: 5_000 },
  { name: 'All JavaScript and WASM', files: runtime, limit: 1_300_000 },
];
for (const { name, files, limit } of budgets) {
  const bytes = await compressedBytes(files);
  if (bytes > limit) throw new Error(`${name}: ${bytes} gzip bytes exceeds the ${limit} byte budget`);
  console.log(`${name}: ${bytes.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} gzip bytes (Brotli at best ${(await brotliBytes(files)).toLocaleString('en-US')})`);
}
