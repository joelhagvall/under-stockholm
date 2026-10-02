import { expect, test } from 'bun:test';
import { addressKey, blockKey, CachedBuild, Cooldown, DAY_MS, DayCap, foreignOrigin, MAX_BODY, readBody, untilMidnight } from '../server/limits';

test('IPv4 is its own address, IPv6 counts by its /64', () => {
  expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
  expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  expect(addressKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
  expect(addressKey('2001:DB8:0001:0002::abcd')).toBe('2001:db8:1:2::/64');
  expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
  expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  // Every address in one block is the same visitor.
  expect(addressKey('2001:db8:1:2:ffff::')).toBe(addressKey('2001:db8:1:2::9'));
});

test('a body is read only as far as the limit, whatever it claims', async () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request('http://relay/perf', { method: 'POST', body, headers });
  expect(await readBody(post('{"v":1}'))).toBe('{"v":1}');
  expect(await readBody(post('x'.repeat(MAX_BODY + 1)))).toBeNull();
  expect(await readBody(post('small', { 'content-length': String(10 * MAX_BODY) }))).toBeNull();
  // Sent in pieces, without a length.
  const chunks = new ReadableStream<Uint8Array>({
    start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(1024)); c.close(); },
  });
  expect(await readBody(post(chunks))).toBeNull();
  expect(await readBody(new Request('http://relay/perf'))).toBe('');
});

test('a cooldown lets each address go once per interval, and forgets it after', () => {
  const c = new Cooldown(1000);
  expect(c.ready('a', 0)).toBe(true);
  c.mark('a', 0);
  expect(c.ready('a', 999)).toBe(false);
  expect(c.ready('b', 999)).toBe(true);
  expect(c.ready('a', 1000)).toBe(true);
  // Many addresses do not make it grow past what the last interval saw, nor reset anyone's wait.
  for (let i = 0; i < 10_000; i++) c.mark(`x${i}`, 2000 + i);
  expect(c.size).toBeLessThanOrEqual(1001);
  expect(c.ready('x9999', 12_000)).toBe(false);
});

test('a cached build is built at most once per interval', () => {
  let builds = 0;
  const c = new CachedBuild(1000);
  const build = () => ++builds;
  expect(c.get(build, 0)).toBe(1);
  expect(c.get(build, 999)).toBe(1);
  expect(c.get(build, 1000)).toBe(2);
  expect(c.get(build, 1500)).toBe(2);
});

test('an IPv6 address lies in its /48, IPv4 in no block', () => {
  expect(blockKey(addressKey('2001:db8:1:2:3:4:5:6'))).toBe('2001:db8:1::/48');
  expect(blockKey(addressKey('2001:db8::1'))).toBe('2001:db8:0::/48');
  // Every /64 in one /48 is the same block.
  expect(blockKey(addressKey('2001:db8:1:ffff::1'))).toBe(blockKey(addressKey('2001:db8:1:2::9')));
  expect(blockKey(addressKey('203.0.113.7'))).toBeNull();
});

test('a day cap counts each key against its limit and starts over at midnight UTC', () => {
  const noon = Date.UTC(2026, 8, 28, 12);
  const cap = new DayCap(3);
  expect(cap.spend('a', 2, noon)).toBe(true);
  expect(cap.spent('a', noon)).toBe(false);
  expect(cap.spend('a', 1, noon)).toBe(true);
  expect(cap.spent('a', noon)).toBe(true);
  expect(cap.spend('a', 1, noon)).toBe(false);
  // Others keep their own share.
  expect(cap.spend('b', 1, noon)).toBe(true);
  // A new day forgives everyone.
  const tomorrow = noon + DAY_MS;
  expect(cap.spent('a', tomorrow)).toBe(false);
  expect(cap.spend('a', 1, tomorrow)).toBe(true);
  expect(untilMidnight(noon)).toBe(DAY_MS / 2);
});

test('a day cap stays small however many keys come: newcomers share one count once it is full', () => {
  const noon = Date.UTC(2026, 8, 28, 12);
  const cap = new DayCap(10, 100);
  for (let i = 0; i < 10_000; i++) cap.spend(`k${i}`, 1, noon);
  expect(cap.size).toBeLessThanOrEqual(101);
  // The ones it knew keep their own count; the rest spent the shared one long ago.
  expect(cap.spent('k0', noon)).toBe(false);
  expect(cap.spent('k9999', noon)).toBe(true);
});

test('a page on another site is foreign, the game itself and clients without a page are not', () => {
  const from = (origin: string | null, url = 'https://understockholm.com/ghosts') => new Request(url, { headers: origin === null ? {} : { origin } });
  expect(foreignOrigin(from('https://understockholm.com'))).toBe(false);
  expect(foreignOrigin(from('https://www.understockholm.com', 'https://www.understockholm.com/notes'))).toBe(false);
  expect(foreignOrigin(from('http://localhost:5180', 'http://localhost:5180/ghosts'))).toBe(false);
  expect(foreignOrigin(from(null))).toBe(false);
  expect(foreignOrigin(from('https://evil.example'))).toBe(true);
  expect(foreignOrigin(from('https://understockholm.com.evil.example'))).toBe(true);
  expect(foreignOrigin(from('null'))).toBe(true);
});
