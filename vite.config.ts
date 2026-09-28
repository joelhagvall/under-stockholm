import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { ICONS } from './scripts/icon.ts';

// Set by scripts/dev.ts, which starts the relay on a free port.
const relay = process.env.RELAY_PORT && `http://localhost:${process.env.RELAY_PORT}`;

/**
 * The landing page alone, without the game (LANDING_ONLY=1, `bun run deploy --landing`): the game, the network view and
 * the physics are not built at all, and the ways into them on the page become a line saying the game opens soon.
 */
const LANDING_ONLY = process.env.LANDING_ONLY === '1';

/**
 * The recorded announcements (`public/audio/`, the Utrop library) are not in the repository and never go public: SL
 * does not own the voice and declined to approve it. Without the clips, or with RECORDINGS=0 (what `bun run deploy`
 * builds), the game speaks every call with the browser's voice and synthesizes the chime and the door warning, and no
 * clip goes into `dist/`. The recorded sounds of people in `public/audio/sfx/` are free to use and stay. The landing
 * page alone has no audio at all.
 */
const RECORDINGS = process.env.RECORDINGS !== '0' && !LANDING_ONLY && existsSync(new URL('./public/audio/nasta.mp3', import.meta.url));

/** Takes the recordings that may not go out out of the build, after Vite has copied `public/`. */
function recordings(): Plugin {
  let out = '';
  return {
    name: 'under-stockholm-recordings',
    apply: 'build',
    configResolved(config) { out = resolve(config.root, config.build.outDir, 'audio'); },
    closeBundle() {
      if (RECORDINGS) return;
      if (LANDING_ONLY) { rmSync(out, { recursive: true, force: true }); return; }
      for (const name of readdirSync(out)) if (name !== 'sfx') rmSync(join(out, name), { recursive: true, force: true });
    },
  };
}

/** The ways into the game on each landing page, between these markers; in the landing page alone, its `data-soon` line. */
const GAME_BLOCK = /<!-- game -->([\s\S]*?)<!-- \/game -->\n?/;
function gameBlock(html: string): string {
  const match = GAME_BLOCK.exec(html);
  if (!match) return html;
  if (!LANDING_ONLY) return html.replace(GAME_BLOCK, (_, block: string) => block.replace(/^\n/, ''));
  const soon = /data-soon="([^"]*)"/.exec(match[1])?.[1];
  if (!soon) throw new Error('The game block needs a data-soon line for the landing page alone.');
  return html.replace(GAME_BLOCK, `<p class="menu-soon">${soon}</p>\n`);
}

/** The landing page in each language, relative to the site root. The first is the default. */
const PAGES = [{ lang: 'sv', path: '' }, { lang: 'en', path: 'en/' }];

/**
 * The site's public address, and the files that need it: link previews, canonical and hreflang links want absolute URLs.
 * Build with SITE_URL=https://example.se/ for production. Without it the build points at the local production server
 * (`bun run serve:prod`) so audits pass, and warns.
 */
function site(): Plugin {
  let url = process.env.SITE_URL?.replace(/\/?$/, '/') ?? '';
  let dev: ViteDevServer | null = null;
  const base = () => url || dev?.resolvedUrls?.local[0] || 'http://localhost:5180/';
  const alternates = (indent: string) => [
    ...PAGES.map((p) => `${indent}<xhtml:link rel="alternate" hreflang="${p.lang}" href="${base()}${p.path}"/>`),
    `${indent}<xhtml:link rel="alternate" hreflang="x-default" href="${base()}${PAGES[0].path}"/>`,
  ].join('\n');
  const files: Record<string, { type: string; body: () => string | Uint8Array }> = {
    'robots.txt': { type: 'text/plain', body: () => `User-agent: *\nAllow: /\n\nSitemap: ${base()}sitemap.xml\n` },
    'sitemap.xml': {
      type: 'application/xml',
      body: () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map((p) => `  <url>\n    <loc>${base()}${p.path}</loc>\n${alternates('    ')}\n  </url>`).join('\n')}
</urlset>
`,
    },
    'llms.txt': {
      type: 'text/plain',
      body: () => `# Under Stockholm

> A free first-person browser game in a stylized Stockholm metro: the blue, red and green lines, 100 stations and one shared clock, so every player meets the same trains. Menus in English or Swedish; signs and announcements in Swedish, as in the real metro. Not affiliated with SL.

## Pages

- [Under Stockholm](${base()}${PAGES[1].path}): the English landing page, with a live map of the blue line and the game itself
- [Under Stockholm på svenska](${base()}): the same page in Swedish

## Source

- [joelhagvall/under-stockholm](https://github.com/joelhagvall/under-stockholm): the code, MIT: TypeScript, three.js and Rapier, no game engine
`,
    },
    ...Object.fromEntries(ICONS.map((icon) => [icon.file, { type: 'image/png', body: icon.png }])),
  };
  return {
    name: 'under-stockholm-site',
    configResolved(config) {
      if (url || config.command !== 'build') return;
      url = 'http://localhost:4173/';
      config.logger.warn(`SITE_URL is not set: link previews, canonical and hreflang point at ${url}. Build with SITE_URL=https://… for production.`);
    },
    configureServer(server) {
      dev = server;
      server.middlewares.use((req, res, next) => {
        const file = files[(req.url ?? '').replace(/^\//, '').split('?')[0]];
        if (!file) return next();
        res.setHeader('content-type', file.type);
        res.end(file.body());
      });
    },
    transformIndexHtml: (html) => gameBlock(html.replaceAll('%SITE_URL%', base())),
    generateBundle() {
      for (const [fileName, file] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: file.body() });
      // Cache rules for the host (Cloudflare reads `_headers`): built files carry a hash in their names, so a returning
      // player gets the whole game from the browser's cache. Only in the build: the dev server must never cache.
      this.emitFile({ type: 'asset', fileName: '_headers', source: '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n' });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [site(), recordings()],
  // Constants, so the landing page alone leaves the game's code out of the build instead of only never running it,
  // and a build without the recordings never asks for them.
  define: { __GAME__: JSON.stringify(!LANDING_ONLY), __RECORDINGS__: JSON.stringify(RECORDINGS) },
  // Plain `bunx vite` too starts away from Vite's default 5173, which other projects on this machine use.
  server: {
    port: 5180,
    proxy: relay ? {
      '/ghosts': { target: relay, ws: true },
      '/feeds': relay,
      '/notes': relay,
      '/perf': relay,
      '/errors': relay,
    } : undefined,
  },
  // Pre-bundling Rapier splits its JS glue from the copy the WASM binary imports, so the two stop sharing memory.
  optimizeDeps: { exclude: ['@dimforge/rapier3d'] },
  build: {
    manifest: true,
    target: ['es2022', 'safari15'],
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      input: PAGES.map((p) => resolve(import.meta.dirname, p.path, 'index.html')),
    },
  },
});
