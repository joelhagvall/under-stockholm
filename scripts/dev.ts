// `bun run dev`: the relay (server/ghosts.ts) on a free port, and Vite in front
// of it on the first port from 5180 that nothing else listens on (never Vite's
// default 5173, which other projects on this machine use). Vite proxies
// /ghosts, /feeds, /notes, /perf and /errors to the relay, so the game only ever
// talks to its own origin.

export {};

/** Can something listen on this port and address right now? */
function free(port: number, hostname: string): boolean {
  try {
    Bun.serve({ port, hostname, fetch: () => new Response() }).stop(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * The first port from `from` that is free on IPv4 and IPv6 alike. Vite only checks the address it binds, so another
 * server on the same port over the other protocol would share `localhost` with it and the browser could reach either.
 */
function freePort(from: number): number {
  for (let port = from; port < from + 200; port++) {
    if (['127.0.0.1', '0.0.0.0', '::1', '::'].every((host) => free(port, host))) return port;
  }
  // Nothing free nearby: any port the system hands out.
  return anyPort();
}

/** A port the system hands out, free by definition. */
function anyPort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port!;
  probe.stop(true);
  return port;
}

const relayPort = String(anyPort());
const args = process.argv.slice(2);
// A port given on the command line wins; otherwise Vite gets the free one and may not wander off it.
const port = args.includes('--port') ? [] : ['--port', String(freePort(5180)), '--strictPort'];

const env = { ...process.env, RELAY_PORT: relayPort };
const relay = Bun.spawn([process.execPath, 'server/ghosts.ts'], { env: { ...env, PORT: relayPort }, stdio: ['ignore', 'inherit', 'inherit'] });
const vite = Bun.spawn([process.execPath, 'x', 'vite', ...port, ...args], { env, stdio: ['inherit', 'inherit', 'inherit'] });

// Take both down together, whichever way the launcher is stopped.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => vite.kill(signal));
const code = await vite.exited;
relay.kill();
process.exit(code);
