import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildShape, deployFlags } from '../scripts/tested';

function withDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'us-shape-'));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a deploy sets both build flags, so a LANDING_ONLY or RECORDINGS left in the shell cannot change the build', () => {
  withDir((dir) => {
    // What `bun run release` measured: the game without the recordings.
    const released = buildShape({ RECORDINGS: '0' }, dir);
    // A shell that still has LANDING_ONLY=1 deploying the game: the flags win over it, and the shape still matches.
    const shell = { LANDING_ONLY: '1', RECORDINGS: '1' };
    expect(buildShape({ ...shell, ...deployFlags(false, false) }, dir)).toBe(released);
    expect(deployFlags(false, false)).toEqual({ LANDING_ONLY: '0', RECORDINGS: '0' });
    expect(deployFlags(true, true)).toEqual({ LANDING_ONLY: '1', RECORDINGS: '0' });
    // Without the flags, the inherited LANDING_ONLY is a different build, and the shape says so.
    expect(buildShape(shell, dir)).not.toBe(released);
  });
});

test('the configuration Vite reads besides the code is part of the shape', () => {
  withDir((dir) => {
    const bare = buildShape({ RECORDINGS: '0' }, dir);
    expect(bare).toContain('config=none');
    writeFileSync(join(dir, '.env.local'), 'VITE_GHOSTS_URL=wss://relay.example/ghosts\n');
    const relay = buildShape({ RECORDINGS: '0' }, dir);
    expect(relay).not.toBe(bare);
    writeFileSync(join(dir, '.env.local'), 'VITE_GHOSTS_URL=off\n');
    expect(buildShape({ RECORDINGS: '0' }, dir)).not.toBe(relay);
    rmSync(join(dir, '.env.local'));
    expect(buildShape({ RECORDINGS: '0' }, dir)).toBe(bare);
    // A VITE_ variable in the shell counts as well; other variables do not.
    expect(buildShape({ RECORDINGS: '0', VITE_GHOSTS_URL: 'off' }, dir)).not.toBe(bare);
    expect(buildShape({ RECORDINGS: '0', HOME: '/elsewhere' }, dir)).toBe(bare);
  });
});

test('a production variable referencing the shell changes the shape when its resolved value changes', () => {
  withDir((dir) => {
    writeFileSync(join(dir, '.env.production'), 'VITE_GHOSTS_URL=${US_TEST_RELAY}\n');
    const env = { RECORDINGS: '0', US_TEST_RELAY: 'wss://first.example/ghosts' };
    const first = buildShape(env, dir);
    expect(buildShape({ ...env, US_TEST_RELAY: 'wss://second.example/ghosts' }, dir)).not.toBe(first);
    expect(buildShape({ ...env, US_TEST_UNUSED: 'changed' }, dir)).toBe(first);
  });
});

test('a VITE_ shell override wins over a variable reference in the production file', () => {
  withDir((dir) => {
    writeFileSync(join(dir, '.env.production'), 'VITE_GHOSTS_URL=${US_TEST_RELAY}\n');
    const env = { RECORDINGS: '0', US_TEST_RELAY: 'wss://first.example/ghosts', VITE_GHOSTS_URL: 'off' };
    const first = buildShape(env, dir);
    expect(buildShape({ ...env, US_TEST_RELAY: 'wss://second.example/ghosts' }, dir)).toBe(first);
    expect(buildShape({ ...env, VITE_GHOSTS_URL: 'wss://override.example/ghosts' }, dir)).not.toBe(first);
  });
});
