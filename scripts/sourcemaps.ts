// Reads a player's stack (from /errors) back to `src/`: each `/assets/<chunk>-<hash>.js:line:column` becomes the file,
// line and column it was built from, by the source maps the build left in `.maps/latest/` (vite.config.ts) and those
// `bun run deploy` kept in `.maps/` of every build it uploaded. A chunk with no map here (built elsewhere, or before the
// maps were kept) is left as it was and named in `missing`.

import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';

const MAPS = join(import.meta.dir, '..', '.maps');
const FRAME = /\/assets\/([\w.-]+\.js):(\d+):(\d+)/g;
const maps = new Map<string, TraceMap | null>();

function mapOf(chunk: string, dir: string): TraceMap | null {
  const key = join(dir, chunk);
  if (!maps.has(key)) {
    const path = [join(dir, `${chunk}.map`), join(dir, 'latest', `${chunk}.map`)].find(existsSync);
    maps.set(key, path ? new TraceMap(readFileSync(path, 'utf8')) : null);
  }
  return maps.get(key)!;
}

/** Chunks met in `symbolicate` that had no map. */
export const missing = new Set<string>();

/** `stack` with every frame in a built chunk read back to its source, where its map is here. */
export function symbolicate(stack: string, dir = MAPS): string {
  return stack.replace(FRAME, (whole, chunk: string, line: string, column: string) => {
    const map = mapOf(chunk, dir);
    if (!map) { missing.add(chunk); return whole; }
    // Stacks count columns from 1, source maps from 0.
    const at = originalPositionFor(map, { line: Number(line), column: Number(column) - 1 });
    if (!at.source || at.line === null) return whole;
    // The sources are relative to dist/assets/: `../../src/game/boot.ts`.
    const source = at.source.replace(/^(\.\.\/)+/, '');
    return `${source}:${at.line}:${at.column + 1}${at.name ? ` (${at.name})` : ''}`;
  });
}

/** Keeps the maps of the build in `.maps/latest/`, the one just uploaded, and drops kept maps no deploy has used in `days`. */
export function keepMaps(days = 120): number {
  const latest = join(MAPS, 'latest');
  const names = existsSync(latest) ? readdirSync(latest).filter((n) => n.endsWith('.map')) : [];
  // Copied anew each time, so a chunk every deploy still ships keeps a recent time.
  for (const name of names) copyFileSync(join(latest, name), join(MAPS, name));
  const old = Date.now() - days * 86_400_000;
  for (const name of readdirSync(MAPS)) if (name.endsWith('.map') && statSync(join(MAPS, name)).mtimeMs < old) rmSync(join(MAPS, name));
  return names.length;
}
