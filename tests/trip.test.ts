import { expect, test } from 'bun:test';
import { NETWORK } from '../src/game/line';
import { planTrip, TripGuide, waitText, type TripView } from '../src/game/trip';

const net = NETWORK;
const index = (name: string, line = 0) => net.stations.findIndex((s) => s.name === name && s.line === line);
const names = [...new Set(net.stations.map((s) => s.name))];

test('a ride along the trunk takes either branch', () => {
  const trip = planTrip(net, 'Kungsträdgården', 'Fridhemsplan')!;
  expect(trip.legs.length).toBe(1);
  const [leg] = trip.legs;
  expect(leg.track).toBe(1);
  expect(leg.stops).toBe(3);
  expect(leg.routes.map((r) => net.routes[r].number).sort()).toEqual(['10', '11']);
});

test('from one branch to the other, the change is where they part', () => {
  const trip = planTrip(net, 'Hjulsta', 'Akalla')!;
  expect(trip.legs.map((l) => [net.stations[l.from].name, net.stations[l.to].name, l.track])).toEqual([['Hjulsta', 'Västra skogen', 2], ['Västra skogen', 'Akalla', 1]]);
});

test('between lines, the walk joins two stations of one name', () => {
  const trip = planTrip(net, 'Hjulsta', 'Mörby centrum')!;
  expect(trip.legs.length).toBe(2);
  const [a, b] = trip.legs;
  expect(a.to).not.toBe(b.from);
  expect(net.stations[a.to].name).toBe(net.stations[b.from].name);
  expect(net.lines[b.line].id).toBe('red');
});

test('every station can be reached from every other, and a station from itself cannot', () => {
  expect(planTrip(net, 'Kista', 'Kista')).toBeNull();
  expect(planTrip(net, 'Kista', 'Nowhere')).toBeNull();
  for (const from of ['Hjulsta', 'Ropsten', 'Hässelby strand']) {
    for (const to of names) {
      if (to === from) continue;
      const trip = planTrip(net, from, to);
      expect(trip, `${from} to ${to}`).not.toBeNull();
      // Each leg starts where the one before ended, or at the same station on another line.
      trip!.legs.forEach((leg, i) => {
        expect(leg.routes.length, `${from} to ${to}`).toBeGreaterThan(0);
        if (i > 0) expect(net.stations[leg.from].name).toBe(net.stations[trip!.legs[i - 1].to].name);
      });
      expect(net.stations[trip!.legs.at(-1)!.to].name).toBe(to);
      expect(trip!.legs.length, `${from} to ${to}`).toBeLessThanOrEqual(3);
    }
  }
});

test('the guide follows a trip with a change to the end', () => {
  const trip = planTrip(net, 'Hjulsta', 'Akalla')!;
  const guide = new TripGuide(net, trip);
  const onFoot = (station: string): TripView => ({ aboard: null, elsewhere: false, station: index(station), platform: true });
  const aboard = (train: number, at: string | null, ahead: string[]): TripView => ({ aboard: { train, at: at === null ? null : index(at), ahead: ahead.map((s) => index(s)) }, elsewhere: false, station: null, platform: false });
  expect(guide.step(onFoot('Hjulsta')).say).toBeNull();
  const inbound = ['Tensta', 'Rinkeby', 'Rissne', 'Duvbo', 'Sundbybergs centrum', 'Solna strand', 'Huvudsta', 'Västra skogen', 'Stadshagen'];
  expect(guide.step(aboard(1, 'Hjulsta', inbound)).status).toContain('8');
  const next = guide.step(aboard(1, null, ['Västra skogen', 'Stadshagen']));
  expect(next.say).not.toBeNull();
  expect(guide.step(aboard(1, null, ['Västra skogen', 'Stadshagen'])).say).toBeNull();
  expect(guide.step(aboard(1, 'Västra skogen', ['Stadshagen'])).say).not.toBeNull();
  // Off at the change: the next leg.
  expect(guide.step(onFoot('Västra skogen')).say).not.toBeNull();
  expect(guide.current.track).toBe(1);
  // The wrong train is said once.
  const wrong = guide.step(aboard(2, 'Västra skogen', ['Huvudsta', 'Solna strand']));
  expect(wrong.say).not.toBeNull();
  expect(guide.step(aboard(2, 'Västra skogen', ['Huvudsta', 'Solna strand'])).say).toBeNull();
  expect(guide.step(aboard(3, 'Västra skogen', ['Solna centrum', 'Näckrosen', 'Hallonbergen', 'Kista', 'Husby', 'Akalla'])).status).toContain('6');
  expect(guide.step(aboard(3, 'Akalla', [])).done).toBe(false);
  const end = guide.step(onFoot('Akalla'));
  expect(end.done).toBe(true);
  expect(end.say).toContain('Akalla');
});

test('off at the wrong station, the guide finds the way on from there', () => {
  const guide = new TripGuide(net, planTrip(net, 'Kungsträdgården', 'Akalla')!);
  guide.step({ aboard: { train: 1, at: index('Kungsträdgården'), ahead: [index('T-Centralen'), index('Rådhuset')] }, elsewhere: false, station: null, platform: false });
  const update = guide.step({ aboard: null, elsewhere: false, station: index('Rådhuset'), platform: true });
  expect(update.say).not.toBeNull();
  expect(net.stations[guide.current.from].name).toBe('Rådhuset');
});

test('waiting on the first platform, the guide says how long', () => {
  expect(waitText({ seconds: 5, clock: '12:00' })).toBe('nu');
  expect(waitText({ seconds: 190, clock: '12:03' })).toBe('om 4 min');
  expect(waitText({ seconds: 5 * 3600, clock: '05:12' })).toBe('kl 05:12');
  const guide = new TripGuide(net, planTrip(net, 'Kungsträdgården', 'Rådhuset')!);
  const at = { aboard: null, elsewhere: false, station: index('Kungsträdgården'), platform: true };
  expect(guide.step({ ...at, wait: { seconds: 190, clock: '12:03' } }).status).toEndWith('· om 4 min');
  expect(guide.step({ ...at, wait: null }).status).not.toContain('min');
});
