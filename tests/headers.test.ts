import { expect, test } from 'bun:test';
import { securityHeaders, withSecurityHeaders } from '../server/headers';

const directive = (headers: Record<string, string>, name: string) => headers['Content-Security-Policy'].split('; ').find((part) => part.startsWith(`${name} `))!.split(' ').slice(1);

test('only the configured relay origins are added, without paths, credentials or a wildcard', () => {
  const headers = securityHeaders({ site: 'https://understockholm.com/', relay: 'wss://user:password@relay.example:8443/ghosts?key=private' });
  expect(directive(headers, 'connect-src')).toEqual(["'self'", 'data:', 'wss://understockholm.com', 'wss://www.understockholm.com', 'wss://relay.example:8443', 'https://relay.example:8443']);
  expect(headers['Content-Security-Policy']).not.toContain('password');
  expect(headers['Content-Security-Policy']).not.toContain('private');
  expect(directive(securityHeaders({ relay: 'off' }), 'connect-src')).toEqual(["'self'", 'data:']);
  expect(() => securityHeaders({ relay: 'https://relay.example/ghosts' })).toThrow('VITE_GHOSTS_URL');
  expect(() => securityHeaders({ relay: 'data:text/plain,hello' })).toThrow('VITE_GHOSTS_URL');
});

test('game builds allow Safari 15 WASM, while report pages keep evaluation blocked', () => {
  const game = securityHeaders({ wasm: true, site: 'http://localhost:4173/' });
  expect(directive(game, 'script-src')).toContain("'unsafe-eval'");
  expect(directive(game, 'script-src')).not.toContain("'unsafe-inline'");
  expect(directive(game, 'connect-src')).toContain('ws://localhost:4173');
  expect(directive(securityHeaders(), 'script-src')).toEqual(["'self'"]);
});

test('fetched responses keep their status, body and upstream headers when secured', async () => {
  const original = await fetch('data:text/plain,report');
  const secured = withSecurityHeaders(original);
  expect(await secured.text()).toBe('report');
  expect(secured.status).toBe(200);
  expect(secured.headers.get('content-type')).toBe(original.headers.get('content-type'));
  expect(secured.headers.get('x-frame-options')).toBe('DENY');
  const error = withSecurityHeaders(new Response('slow down', { status: 429, headers: { 'retry-after': '60', 'access-control-allow-origin': '*' } }));
  expect(error.status).toBe(429);
  expect(await error.text()).toBe('slow down');
  expect(error.headers.get('retry-after')).toBe('60');
  expect(error.headers.get('access-control-allow-origin')).toBe('*');
  expect(error.headers.get('content-security-policy')).toBe(securityHeaders()['Content-Security-Policy']);
});
