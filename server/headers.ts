/** Browser policy shared by the static build, the production preview and Worker responses. */
export function securityHeaders(options: { site?: string; relay?: string; wasm?: boolean } = {}): Record<string, string> {
  const connections = new Set(["'self'", 'data:']);
  // Explicit socket origins also work in older Safari, whose 'self' does not cover WebSockets.
  if (options.site) {
    const site = new URL(options.site);
    connections.add(site.origin.replace(/^http/, 'ws'));
    if (site.hostname === 'understockholm.com' || site.hostname === 'www.understockholm.com') {
      connections.add('wss://understockholm.com');
      connections.add('wss://www.understockholm.com');
    }
  }
  if (options.relay && options.relay !== 'off') {
    const relay = new URL(options.relay);
    if (!/^wss?:$/.test(relay.protocol)) throw new Error('VITE_GHOSTS_URL must be a ws:// or wss:// URL, or off.');
    connections.add(relay.origin);
    connections.add(relay.origin.replace(/^ws/, 'http'));
  }
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': [
      "default-src 'self'",
      // Safari 15 needs unsafe-eval for WASM. Inline scripts remain blocked; report pages need neither exception.
      `script-src 'self'${options.wasm ? " 'wasm-unsafe-eval' 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      `connect-src ${[...connections].join(' ')}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/** Rebuild fetched responses with writable headers. Leave a successful socket's upgrade and socket intact. */
export function withSecurityHeaders(response: Response): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
