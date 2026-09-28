import { expect, test } from 'bun:test';
import { announcementAt, AnnouncementTracker, ARRIVAL_LEAD, NEXT_STOP_PLATFORM_LEAD, T_CENTRALEN_PLATFORM_LEAD } from '../src/game/announcements';
import { ARRIVAL_PAUSE, RECORDED_ANNOUNCEMENTS, WARNING_PAUSE } from '../src/game/announcementSignal';
import { BLUE_LINE, NETWORK, serviceDestination, isLineTerminal, routeTimetables } from '../src/game/line';
import { PLATFORM_HALF_L, TRAIN_HALF_L } from '../src/game/layout';
import { DEPARTURE_HOLD, DOOR_SLIDE, DOOR_WARNING } from '../src/game/timetable';

const routes = routeTimetables(BLUE_LINE);
/** The Akalla route (11): the trunk and the branch straight on. */
const timetable = routes[1];
const stop = timetable.stopIndex(1, 1);
const arrival = timetable.arrival(stop);
const platform = { trainId: null, station: 1, onPlatform: true };
const aboard = { trainId: 7, station: null, onPlatform: false };
const service = (time: number, id = 7, tt = timetable) => ({ id, time, state: tt.stateAt(time), timetable: tt });

test('waiting on a platform never produces an arrival voice or caption, including the first train', () => {
  for (const track of [1, 2] as const) {
    for (const station of timetable.route) {
      const due = timetable.arrival(timetable.stopIndex(station, track));
      for (const delta of [-15, -10, -1, 0, 1, 5]) {
        const candidate = announcementAt(NETWORK, [service(due + delta)], { ...platform, station });
        expect(candidate).toBeNull();
        expect(new AnnouncementTracker().update(candidate).event).toBeNull();
      }
    }
  }
});

test('onboard announcements follow only the occupied train and its current phase', () => {
  const other = service(timetable.arrival(timetable.stopIndex(3, 2)) + 1, 8);
  expect(announcementAt(NETWORK, [other, service(platformEntry(stop) - 2)], aboard)?.text).toContain('Nästa: T-Centralen.');
  const event = announcementAt(NETWORK, [service(arrival + 1), other], aboard);
  expect(event?.text).toBe('T-Centralen.');
  expect(event?.recording).toBe('tCentralenArrival');
  expect(event?.startAllowed).toBe(false);
  const closing = arrival + timetable.stopDuration(stop) - DEPARTURE_HOLD - DOOR_WARNING - DOOR_SLIDE + 0.01;
  expect(announcementAt(NETWORK, [service(closing)], aboard)).toBeNull();
  expect(announcementAt(NETWORK, [service(arrival + 1)], { ...aboard, trainId: null })).toBeNull();
});

test('terminal arrivals and reverse-track approaches use the correct message', () => {
  const terminal = timetable.stopIndex(0, 2);
  const time = timetable.arrival(terminal);
  expect(announcementAt(NETWORK, [service(time + 1)], aboard)?.text).toContain('avstigning för samtliga trafikanter');
  expect(announcementAt(NETWORK, [service(time - 10)], { ...platform, station: 0 })).toBeNull();
});

test('notices play once, cancel on context changes and become eligible on the next cycle', () => {
  const tracker = new AnnouncementTracker();
  const event = announcementAt(NETWORK, [service(platformEntry(stop) - 1)], aboard)!;
  expect(tracker.update(event)).toEqual({ changed: true, event });
  expect(tracker.update(event).changed).toBe(false);
  expect(tracker.update(null)).toEqual({ changed: true, event: null });
  expect(tracker.update(event)).toEqual({ changed: false, event: null });
  const nextCycle = announcementAt(NETWORK, [service(platformEntry(stop) + timetable.cycle - 1)], aboard)!;
  expect(tracker.update(nextCycle)).toEqual({ changed: true, event: nextCycle });
});

test('the buzzer leads the door slide by only 0.4 seconds and doors close before departure', () => {
  const departure = arrival + timetable.stopDuration(stop);
  const warning = departure - DEPARTURE_HOLD - DOOR_SLIDE - DOOR_WARNING;
  const duringWarning = timetable.stateAt(warning + DOOR_WARNING - 0.01);
  expect(DOOR_WARNING).toBeCloseTo(0.4);
  expect(timetable.stateAt(warning - 0.01).phase).toBe('dwell');
  expect(timetable.stateAt(warning + 0.5).doors).toBeLessThan(1);
  expect(duringWarning.phase).toBe('closing');
  expect(duringWarning.doors).toBe(1);
  expect(timetable.stateAt(departure - DEPARTURE_HOLD - DOOR_SLIDE / 2).doors).toBeCloseTo(0.5);
  expect(timetable.stateAt(departure + 0.01).doors).toBe(0);
  expect(timetable.stateAt(departure + 0.01).phase).toBe('moving');
});


/** Locate platform entry independently from announcement eligibility. */
function platformEntry(stopIndex: number): number {
  const stop = timetable.stops[stopIndex];
  let before = timetable.arrival(stopIndex - 1) + timetable.stopDuration(stopIndex - 1);
  let after = timetable.arrival(stopIndex);
  const direction = stop.track === 1 ? 1 : -1;
  const edge = timetable.stationX[stop.station] - direction * PLATFORM_HALF_L;
  for (let i = 0; i < 50; i++) {
    const t = (before + after) / 2;
    const nose = timetable.stateAt(t).x + direction * TRAIN_HALF_L;
    if ((nose - edge) * direction >= 0) after = t;
    else before = t;
  }
  return after;
}

test('T-Centralen starts three seconds before entry, continues transfer and warning while rolling in, and ends on its recorded name', () => {
  for (const track of [1, 2] as const) {
    const k = timetable.stopIndex(1, track);
    const due = timetable.arrival(k);
    const entry = platformEntry(k);
    const departure = timetable.arrival(k - 1) + timetable.stopDuration(k - 1);
    for (let t = departure + 0.1; t < entry - T_CENTRALEN_PLATFORM_LEAD; t += 0.5) {
      expect(announcementAt(NETWORK, [service(t)], aboard)).toBeNull();
    }
    const next = announcementAt(NETWORK, [service(entry - T_CENTRALEN_PLATFORM_LEAD + 0.01)], aboard)!;
    expect(next.recording).toBe('tCentralenApproach');
    expect(next.text).toContain('Nästa: T-Centralen.');
    expect(next.text).toContain(BLUE_LINE.stations[1].transfer!);
    expect(next.alightingWarning).toBe(true);
    expect(T_CENTRALEN_PLATFORM_LEAD).toBe(3);
    expect(entry - T_CENTRALEN_PLATFORM_LEAD + 6.67 + 4.35).toBeLessThan(due);
    const tracker = new AnnouncementTracker();
    const events: string[] = [];
    for (let t = entry - T_CENTRALEN_PLATFORM_LEAD + 0.01; t < due + 10; t += 0.1) {
      const notice = tracker.update(announcementAt(NETWORK, [service(t)], aboard));
      if (notice.changed && notice.event) events.push(notice.event.key);
    }
    const stopped = announcementAt(NETWORK, [service(due + 1)], aboard)!;
    expect(events).toEqual([next.key, stopped.key]);
    expect(stopped.recording).toBe('tCentralenArrival');
    expect(stopped.startAllowed).toBe(false);
  }
});

test('Kungsträdgården and the branch terminals end the line', () => {
  const akalla = timetable.route[timetable.route.length - 1];
  for (const [station, track] of [[0, 2], [akalla, 1]] as const) {
    const k = timetable.stopIndex(station, track);
    const entry = platformEntry(k);
    const next = announcementAt(NETWORK, [service(entry - 2)], aboard)!;
    const rolling = announcementAt(NETWORK, [service(timetable.arrival(k) - 0.5)], aboard)!;
    expect(next.text).toContain('Slutstation,');
    expect(rolling.text).toContain('Slutstation,');
    expect(rolling.text).toContain('avstigning för samtliga trafikanter');
    const stopped = announcementAt(NETWORK, [service(timetable.arrival(k) + 1)], aboard)!;
    expect(stopped.key).toBe(rolling.key);
    expect(stopped.startAllowed).toBe(false);
  }
  expect(announcementAt(NETWORK, [service(timetable.arrival(timetable.stopIndex(akalla, 1)) - 0.5)], aboard)?.recording).toBe('akallaTerminalArrival');
});

test('the Hjulsta route calls at its own branch and ends at Hjulsta', () => {
  const tt = routes[0];
  const hjulsta = tt.route[tt.route.length - 1];
  expect(BLUE_LINE.stations[hjulsta].name).toBe('Hjulsta');
  const k = tt.stopIndex(hjulsta, 1);
  const due = tt.arrival(k);
  const event = announcementAt(NETWORK, [service(due + 1, 7, tt)], aboard)!;
  expect(event.caption).toContain('Hjulsta');
  expect(event.recording).toBe('hjulstaTerminalArrival');
  expect(tt.stateAt(due + 1).x).toBeCloseTo(tt.stationX[hjulsta]);
  // Solna strand has no recording and falls back to speech.
  const strand = BLUE_LINE.stations.findIndex((s) => s.name === 'Solna strand');
  const arrival = announcementAt(NETWORK, [service(tt.arrival(tt.stopIndex(strand, 1)) + 1, 7, tt)], aboard)!;
  expect(arrival.recording).toBeUndefined();
  expect(arrival.text).toContain('Solna strand.');
});

test('turnback notices do not trigger the next-station signal', () => {
  for (let i = 0; i < timetable.stops.length; i++) {
    if (timetable.stops[i].kind !== 'turnback') continue;
    const event = announcementAt(NETWORK, [service(timetable.arrival(i) - 1)], aboard);
    expect(event).not.toBeNull();
    expect(event?.signal).toBe(false);
  }
});


test('boarding a stopped train never starts an announcement or warning at any station', () => {
  for (const track of [1, 2] as const) {
    for (const station of timetable.route) {
      const k = timetable.stopIndex(station, track);
      const due = timetable.arrival(k);
      const entry = platformEntry(k);
      const tracker = new AnnouncementTracker();
      for (const t of [due + 0.1, due + 2, due + 10]) {
        const candidate = announcementAt(NETWORK, [service(t)], aboard);
        expect(tracker.update(candidate).event).toBeNull();
      }
      const approach = announcementAt(NETWORK, [service(entry - 1)], aboard)!;
      expect(approach.alightingWarning).toBe(true);
      expect(approach.startAllowed).toBe(true);
      const boardedDuringApproach = new AnnouncementTracker();
      expect(boardedDuringApproach.update(approach).event).toBe(approach);
      boardedDuringApproach.update(null);
      expect(boardedDuringApproach.update(announcementAt(NETWORK, [service(due + 2)], aboard)).event).toBeNull();
    }
  }
});

test('other stations keep the warning after next and do not append it again on arrival', () => {
  const k = timetable.stopIndex(2, 1);
  const entry = platformEntry(k);
  expect(announcementAt(NETWORK, [service(entry - NEXT_STOP_PLATFORM_LEAD - 0.1)], aboard)).toBeNull();
  const next = announcementAt(NETWORK, [service(entry - NEXT_STOP_PLATFORM_LEAD + 0.1)], aboard)!;
  expect(next.text).toBe('Nästa: Rådhuset.');
  expect(next.alightingWarning).toBe(true);
  const rolling = announcementAt(NETWORK, [service(timetable.arrival(k) - 0.5)], aboard)!;
  expect(rolling.alightingWarning).toBeUndefined();
  const tracker = new AnnouncementTracker();
  tracker.update(next);
  expect(tracker.update(rolling).event).toBe(rolling);
  expect(tracker.update(announcementAt(NETWORK, [service(timetable.arrival(k) + 1)], aboard)).changed).toBe(false);
});

test('service destinations use the real blue-line branches consistently in both directions', () => {
  expect(serviceDestination(NETWORK, 0, 1)).toEqual({ number: '10', name: 'Hjulsta' });
  expect(serviceDestination(NETWORK, 1, 1)).toEqual({ number: '11', name: 'Akalla' });
  for (const id of [0, 1, 2, 3]) {
    expect(serviceDestination(NETWORK, id % 2, 2).name).toBe('Kungsträdgården');
    expect(announcementAt(NETWORK, [service(arrival - 10, id)], platform)).toBeNull();
  }
  expect(isLineTerminal(NETWORK, 3, 1)).toBe(false);
  expect(isLineTerminal(NETWORK, 0, 2)).toBe(true);
});

test('every station selects original recordings and terminal clips follow the direction', () => {
  for (const track of [1, 2] as const) {
    for (const station of timetable.route) {
      const k = timetable.stopIndex(station, track);
      const entry = platformEntry(k);
      const next = announcementAt(NETWORK, [service(entry - 1)], aboard)!;
      const rolling = announcementAt(NETWORK, [service(timetable.arrival(k) - 0.5)], aboard)!;
      expect(next.recording).toBeDefined();
      expect(rolling.recording).toBeDefined();
      if (station === 0) {
        expect(next.recording).toBe(track === 2 ? 'kungstradgardenTerminalApproach' : 'kungstradgardenApproach');
        expect(rolling.recording).toBe(track === 2 ? 'kungstradgardenTerminalArrival' : 'kungstradgardenArrival');
      }
      if (station === 3) expect(rolling.recording).toBe('fridhemsplanArrival');
      if (station === 5) expect(rolling.recording).toBe('vastraskogenArrival');
    }
  }
});

test('every next-station notice starts at the platform approach, not earlier in the tunnel', () => {
  for (const track of [1, 2] as const) {
    for (const station of timetable.route) {
      const k = timetable.stopIndex(station, track);
      const entry = platformEntry(k);
      expect(announcementAt(NETWORK, [service(entry - 3.1)], aboard)).toBeNull();
      const next = announcementAt(NETWORK, [service(entry - 2.9)], aboard)!;
      expect(next.signal).toBe(true);
      expect(next.startAllowed).toBe(true);
      const tracker = new AnnouncementTracker();
      tracker.update(next);
      // Crossing the platform edge must not interrupt the next-station clip or its warning.
      for (let t = entry; t < entry + 4.5; t += 0.1) {
        expect(tracker.update(announcementAt(NETWORK, [service(t)], aboard)).changed).toBe(false);
      }
    }
  }
});

test('station stops keep the doors open for the stop\'s dwell, then close and hold briefly before leaving', () => {
  const dwells = new Set<number>();
  for (let k = 0; k < timetable.stops.length; k++) {
    if (timetable.stops[k].kind !== 'station') continue;
    const due = timetable.arrival(k);
    const dwell = timetable.stops[k].dwell;
    dwells.add(dwell);
    const closes = due + 2 + dwell;
    expect(timetable.stopDuration(k)).toBeCloseTo(dwell + 2 + DOOR_WARNING + DOOR_SLIDE + DEPARTURE_HOLD);
    expect(timetable.stateAt(due + 2).doors).toBeCloseTo(1);
    expect(timetable.stateAt(closes - 0.1).phase).toBe('dwell');
    expect(timetable.stateAt(closes + DOOR_WARNING + 0.5).doors).toBeLessThan(1);
    const leaves = closes + DOOR_WARNING + DOOR_SLIDE + DEPARTURE_HOLD;
    for (const offset of [-0.99, -0.5, -0.01]) {
      const held = timetable.stateAt(leaves + offset);
      expect(held.phase).toBe('waiting');
      expect(held.doors).toBe(0);
      expect(held.speed).toBe(0);
      expect(held.x).toBeCloseTo(timetable.stationX[timetable.stops[k].station]);
    }
    expect(timetable.stateAt(leaves + 0.1).phase).toBe('moving');
  }
  // Busy stations hold the train longer than quiet ones.
  expect(dwells.size).toBeGreaterThan(1);
});

test('transfer information stays in speech but never appears in station captions', () => {
  for (const track of [1, 2] as const) {
    for (const station of [1, 3]) {
      const k = timetable.stopIndex(station, track);
      const entry = platformEntry(k);
      const next = announcementAt(NETWORK, [service(entry - 2)], aboard)!;
      const rolling = announcementAt(NETWORK, [service(timetable.arrival(k) - 0.5)], aboard)!;
      expect(next.caption).toContain(BLUE_LINE.stations[station].name);
      expect(next.caption).not.toContain('Byte till');
      // T-Centralen names its transfers in the approach, the others on arrival.
      expect((station === 1 ? next : rolling).text).toContain('Byte till');
      expect(rolling.caption).toContain(BLUE_LINE.stations[station].name);
      expect(rolling.caption).not.toContain('Byte till');
    }
  }
});

test('traffic information is read out between stations, once per train, and never over the next-stop notice', () => {
  const disruption = { id: 42, header: 'Signalfel vid Fridhemsplan', summary: 'Räkna med förseningar.', stations: ['Fridhemsplan'], weight: 1 };
  // The leg into T-Centralen, just after the doors close at the previous station.
  const leg = Array.from({ length: 60 }, (_, i) => arrival - 60 + i).filter((t) => timetable.stateAt(t).phase === 'moving' && timetable.stateAt(t).next === stop);
  const start = leg[0];
  const notice = announcementAt(NETWORK, [service(start)], aboard, disruption);
  expect(notice?.text).toBe('Trafikinformation. Signalfel vid Fridhemsplan. Räkna med förseningar.');
  expect(notice?.caption).toBe('Trafikinformation: Signalfel vid Fridhemsplan');
  expect(notice?.startAllowed).toBe(true);
  // Late in the leg it may continue but not start.
  const late = leg.find((t) => timetable.secondsUntil(t, stop) < 24 && announcementAt(NETWORK, [service(t)], aboard, disruption)?.key === notice?.key);
  expect(late).toBeDefined();
  expect(announcementAt(NETWORK, [service(late!)], aboard, disruption)?.startAllowed).toBe(false);
  expect(announcementAt(NETWORK, [service(platformEntry(stop) - 2)], aboard, disruption)?.text).toContain('Nästa: T-Centralen.');
  expect(announcementAt(NETWORK, [service(start)], platform, disruption)).toBeNull();
  const tracker = new AnnouncementTracker();
  expect(tracker.update(notice).event).not.toBeNull();
  expect(tracker.update(announcementAt(NETWORK, [service(start + 5)], aboard, disruption)).changed).toBe(false);
  tracker.update(null);
  expect(tracker.update(announcementAt(NETWORK, [service(start + 1)], aboard, disruption)).event).toBeNull();
});

test('every station call ends on a recorded name, never the browser voice', () => {
  for (const tt of routes) {
    for (const [k, stop] of tt.stops.entries()) {
      if (stop.kind !== 'station' || BLUE_LINE.stations[stop.station].name === 'Solna strand') continue;
      const events: Array<string | undefined> = [];
      const tracker = new AnnouncementTracker();
      for (let t = tt.arrival(k) - 40; t < tt.arrival(k) + 5; t += 0.25) {
        const notice = tracker.update(announcementAt(NETWORK, [service(t, 7, tt)], aboard));
        // This stop's own calls; the turnback notice after a terminal is not a station call.
        if (notice.changed && notice.event && /:(next|arrival)$/.test(notice.event.key) && notice.event.key.includes(`:${k}:`)) events.push(notice.event.recording);
      }
      expect(events.length).toBeGreaterThan(0);
      expect(events.every(Boolean)).toBe(true);
      expect(events.at(-1)).toMatch(/Arrival$/);
    }
  }
});

test('at every station the name comes as the train stops, well clear of the approach and warning', () => {
  for (const tt of routes) {
    for (const [k, stop] of tt.stops.entries()) {
      if (stop.kind !== 'station') continue;
      const due = tt.arrival(k);
      const tracker = new AnnouncementTracker();
      const starts: Record<string, { at: number; recording?: string }> = {};
      for (let t = due - 40; t < due + 5; t += 0.05) {
        const notice = tracker.update(announcementAt(NETWORK, [service(t, 7, tt)], aboard));
        if (notice.changed && notice.event?.key.includes(`:${k}:`)) starts[notice.event.key.split(':').pop()!] = { at: t, recording: notice.event.recording };
      }
      const { next, arrival } = starts;
      expect(next).toBeDefined();
      expect(arrival).toBeDefined();
      // The name starts about a second before the train comes to rest, never earlier.
      expect(arrival.at).toBeGreaterThanOrEqual(due - ARRIVAL_LEAD - 0.1);
      expect(arrival.at).toBeLessThan(due);
      // The approach (with its signal) and the warning are over, with at least the usual breath before the name.
      const approach = next.recording ? RECORDED_ANNOUNCEMENTS[next.recording as keyof typeof RECORDED_ANNOUNCEMENTS].duration + 0.8 : 4;
      expect(next.at + approach + WARNING_PAUSE + 4.35 + ARRIVAL_PAUSE).toBeLessThanOrEqual(arrival.at);
    }
  }
});
