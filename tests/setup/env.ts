// The tests run the same wherever they run: Bun loads .env.local into the environment of a script, and a test
// started from one (the hooks, `bun run check`) would otherwise see the developer's Trafiklab keys and take the
// GTFS path in server/feeds.ts, which the feeds tests do not mock.
for (const key of Object.keys(process.env)) if (key.startsWith('TRAFIKLAB_')) delete process.env[key];

// Vite's build constants (vite.config.ts), as in development.
Object.assign(globalThis, { __GAME__: true, __RECORDINGS__: true, __BUILD__: 'test-build' });
