import { afterEach, expect, spyOn, test } from 'bun:test';
import { RECORDED_ANNOUNCEMENTS, SIGNAL_SPEECH_GAP, WARNING_PAUSE } from '../src/game/announcementSignal';
import { Audio, synthChime, synthDoorWarning } from '../src/game/audio';
import { DOOR_SLIDE, DOOR_WARNING } from '../src/game/timetable';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalSpeech = Object.getOwnPropertyDescriptor(globalThis, 'speechSynthesis');
const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance');
const mocks: Array<{ mockRestore(): void }> = [];
afterEach(() => {
  for (const mock of mocks.splice(0)) mock.mockRestore();
  for (const [key, descriptor] of [['window', originalWindow], ['speechSynthesis', originalSpeech], ['SpeechSynthesisUtterance', originalUtterance]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function fixture() {
  let queued: (() => void) | undefined;
  let queuedDelay = 0;
  let signals = 0;
  const signalBuffer = { duration: signalDuration };
  const utterances: SpeechSynthesisUtterance[] = [];
  let cancels = 0;
  const speech = { pending: false, cancel: () => { cancels++; }, speak: (u: SpeechSynthesisUtterance) => utterances.push(u) };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { speechSynthesis: speech } });
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: speech });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(public text: string) {} } });
  mocks.push(spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => { queued = callback; queuedDelay = delay; return 1; }) as typeof setTimeout));
  mocks.push(spyOn(globalThis, 'clearTimeout').mockImplementation(() => { queued = undefined; }));
  const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} };
  const node = () => ({ frequency: param, gain: param, connect() { return this; }, start() {}, stop() {}, disconnect() {} });
  let impacts = 0;
  const recordedBuffer = { duration: 2.9 };
  const warningBuffer = { duration: 4.35 };
  const warningPlays: number[][] = [];
  const warningSources: Array<{ stop(): void; onended?: () => void }> = [];
  let warningStops = 0;
  const recordingPlays: number[][] = [];
  const recordingSources: Array<{ stop(): void; onended?: () => void }> = [];
  let recordingStops = 0;
  const audio = new Audio();
  Object.assign(audio, { ctx: { currentTime: 0, createOscillator: node, createGain: node, createBufferSource: () => ({ ...node(), buffer: null, onended: undefined as (() => void) | undefined, start(...args: number[]) { if (this.buffer === signalBuffer) signals++; else if (this.buffer === recordedBuffer) { recordingPlays.push(args); recordingSources.push(this); } else if (this.buffer === warningBuffer) { warningPlays.push(args); warningSources.push(this); } else impacts++; }, stop() { if (this.buffer === recordedBuffer) recordingStops++; else if (this.buffer === warningBuffer) warningStops++; } }), createBiquadFilter: node }, impactNoise: {}, signalBuffer, recordedBuffers: new Map(Object.keys(RECORDED_ANNOUNCEMENTS).map(key => [key, recordedBuffer])), warningBuffer, master: node(), voice: { lang: 'sv-SE' } });
  return { audio, utterances, recordingPlays, recordingSources, warningPlays, warningSources, get warningStops() { return warningStops; }, get recordingStops() { return recordingStops; }, get signals() { return signals; }, get queuedDelay() { return queuedDelay; }, get impacts() { return impacts; }, flush: () => queued?.(), get queued() { return queued; }, get cancels() { return cancels; } };
}

test('new announcements replace delayed speech and subtitles wait for voice start', () => {
  const f = fixture();
  let firstStarted = 0;
  let latestStarted = 0;
  let ended = 0;
  f.audio.announce('Old station', () => firstStarted++, () => ended++);
  const staleTimer = f.queued!;
  f.audio.announce('Current station', () => latestStarted++, () => ended++);
  staleTimer();
  expect(f.utterances).toHaveLength(0);
  expect(ended).toBe(1);
  expect(firstStarted + latestStarted).toBe(0);
  f.flush();
  expect(f.utterances.map((u) => u.text)).toEqual(['Current station']);
  expect(latestStarted).toBe(0);
  f.utterances[0].onstart?.call(f.utterances[0], {} as SpeechSynthesisEvent);
  expect(latestStarted).toBe(1);
  f.utterances[0].onend?.call(f.utterances[0], {} as SpeechSynthesisEvent);
  expect(ended).toBe(2);
});

test('mute and context cancellation stop speech even with no pending queue', () => {
  const f = fixture();
  let started = 0;
  let ended = 0;
  f.audio.announce('Station', () => started++, () => ended++);
  f.flush();
  f.audio.toggleMute();
  expect(f.cancels).toBe(2);
  expect(ended).toBe(1);
  f.utterances[0].onstart?.call(f.utterances[0], {} as SpeechSynthesisEvent);
  expect(started).toBe(0);
  f.audio.toggleMute();
  f.audio.announce('Next', () => started++, () => ended++);
  f.audio.cancelAnnouncement();
  f.flush();
  expect(f.utterances).toHaveLength(1);
  expect(ended).toBe(2);
});

const signalDuration = 0.8;

test('the reference signal still plays without a Swedish voice, then subtitles appear', () => {
  const f = fixture();
  Object.assign(f.audio, { voice: null });
  let captions = 0;
  f.audio.announce('Nästa: T-Centralen.', () => captions++, () => {}, true);
  expect(captions).toBe(0);
  expect(f.signals).toBeGreaterThan(0);
  expect(f.queuedDelay).toBe((signalDuration + SIGNAL_SPEECH_GAP) * 1000);
  f.flush();
  expect(captions).toBe(1);
  expect(f.utterances).toHaveLength(0);
});


test('wheel joints follow distance and reset when switching trains without a burst', () => {
  const f = fixture();
  const sound = { trainId: 1, distance: 12, speed: 10, braking: 0, loudness: 1, aboard: true };
  f.audio.updateJourney(sound);
  expect(f.impacts).toBe(0);
  f.audio.updateJourney({ ...sound, distance: 13 });
  expect(f.impacts).toBe(2);
  f.audio.updateJourney({ ...sound, distance: 13 });
  expect(f.impacts).toBe(2);
  f.audio.updateJourney({ ...sound, trainId: 2, distance: 300 });
  expect(f.impacts).toBe(2);
  f.audio.toggleMute();
  f.audio.updateJourney({ ...sound, trainId: 2, distance: 313 });
  expect(f.impacts).toBe(2);
});

test('a stationary train never emits impact sounds, whether the listener is aboard or walking outside', () => {
  const f = fixture();
  for (let frame = 0; frame < 200; frame++) {
    f.audio.updateJourney({ trainId: null, distance: 0, speed: 0, braking: 0, loudness: 0, aboard: frame % 2 === 0 });
  }
  expect(f.impacts).toBe(0);
});


test('the recorded signal respects mute', () => {
  const f = fixture();
  f.audio.toggleMute();
  let captions = 0;
  f.audio.announce('Nästa: T-Centralen.', () => captions++, () => {}, true);
  expect(f.signals).toBe(0);
  expect(f.queued).toBeUndefined();
  expect(captions).toBe(1);
});


test('a late audio download cannot resurrect a canceled announcement', async () => {
  const f = fixture();
  let resolve!: (buffer: { duration: number }) => void;
  const load = new Promise<{ duration: number }>((done) => { resolve = done; });
  Object.assign(f.audio, { signalBuffer: null, signalLoad: load });
  f.audio.announce('Nästa: T-Centralen.', () => {}, () => {}, true);
  f.audio.cancelAnnouncement();
  resolve({ duration: signalDuration });
  await load;
  expect(f.signals).toBe(0);
  expect(f.queued).toBeUndefined();
});


test('arrival and transfer speech never play or wait for the signal', () => {
  for (const loading of [false, true]) {
    const f = fixture();
    if (loading) Object.assign(f.audio, { signalBuffer: null, signalLoad: new Promise(() => {}) });
    f.audio.announce('T-Centralen. Byte till röda och gröna linjen.', () => {}, () => {}, false);
    expect(f.signals).toBe(0);
    expect(f.queuedDelay).toBe(0);
    f.flush();
    expect(f.utterances.map((u) => u.text)).toEqual(['T-Centralen. Byte till röda och gröna linjen.']);
  }
});


test('T-Centralen plays next and transfer continuously before appending the shared warning', () => {
  const f = fixture();
  let captions = 0;
  let ended = 0;
  f.audio.announce('Nästa: T-Centralen. Byte till röda och gröna linjerna samt pendeltåg.', () => captions++, () => ended++, true, 'tCentralenApproach', () => captions++);
  expect(f.recordingPlays).toEqual([[0, 0, 2.9]]);
  expect(f.signals).toBe(0);
  expect(captions).toBe(0);
  f.flush();
  expect(captions).toBe(1);
  expect(f.warningPlays).toHaveLength(0);
  f.recordingSources[0].onended?.();
  expect(f.utterances).toHaveLength(0);
  // A pause before the warning.
  expect(f.warningPlays).toHaveLength(0);
  expect(f.queuedDelay).toBe(WARNING_PAUSE * 1000);
  f.flush();
  expect(f.warningPlays).toEqual([[0, 0, 4.35]]);
  expect(captions).toBe(2);
  expect(ended).toBe(0);
  f.warningSources[0].onended?.();
  expect(ended).toBe(1);
  expect(f.utterances).toHaveLength(0);
});

test('mute stops recorded speech and prevents delayed captions', () => {
  const f = fixture();
  let captions = 0;
  f.audio.announce('Nästa: T-Centralen.', () => captions++, () => {}, true, 'tCentralenApproach');
  const delayedCaption = f.queued!;
  f.audio.toggleMute();
  delayedCaption();
  expect(f.recordingStops).toBe(1);
  expect(captions).toBe(0);
  f.audio.announce('T-Centralen.', () => captions++, () => {}, false, 'tCentralenApproach');
  expect(f.recordingPlays).toHaveLength(1);
  expect(captions).toBe(1);
});

test('a late full-recording download cannot play after cancellation', async () => {
  const f = fixture();
  let resolve!: (buffer: { duration: number }) => void;
  const load = new Promise<{ duration: number }>((done) => { resolve = done; });
  Object.assign(f.audio, { recordedBuffers: new Map(), recordedLoads: new Map([['tCentralenApproach', load]]) });
  f.audio.announce('Nästa: T-Centralen.', () => {}, () => {}, true, 'tCentralenApproach');
  f.audio.cancelAnnouncement();
  resolve({ duration: 2.9 });
  await load;
  expect(f.recordingPlays).toHaveLength(0);
  expect(f.impacts).toBe(0);
  expect(f.queued).toBeUndefined();
});


test('other stations append the recorded warning after next-station speech finishes', () => {
  const f = fixture();
  let warned = 0;
  let ended = 0;
  f.audio.announce('Nästa: Rådhuset.', () => {}, () => ended++, false, undefined, () => warned++);
  f.flush();
  expect(f.warningPlays).toHaveLength(0);
  f.utterances[0].onend?.call(f.utterances[0], {} as SpeechSynthesisEvent);
  f.flush();
  expect(f.warningPlays).toEqual([[0, 0, 4.35]]);
  expect(warned).toBe(1);
  expect(ended).toBe(0);
  expect(f.signals).toBe(0);
  f.warningSources[0].onended?.();
  expect(ended).toBe(1);
});

test('T-Centralen appends the shared warning exactly once after its transfer recording', () => {
  const f = fixture();
  let warned = 0;
  f.audio.announce('T-Centralen.', () => {}, () => {}, false, 'tCentralenApproach', () => warned++);
  expect(f.recordingPlays).toEqual([[0, 0, 2.9]]);
  expect(f.warningPlays).toHaveLength(0);
  f.recordingSources[0].onended?.();
  f.flush();
  expect(f.warningPlays).toEqual([[0, 0, 4.35]]);
  expect(warned).toBe(1);
  expect(f.utterances).toHaveLength(0);
  f.audio.toggleMute();
  expect(f.warningStops).toBe(1);
});

test('leaving a station cancels a pending warning download', async () => {
  const f = fixture();
  let resolve!: (buffer: { duration: number }) => void;
  const load = new Promise<{ duration: number }>((done) => { resolve = done; });
  Object.assign(f.audio, { warningBuffer: null, warningLoad: load });
  f.audio.announce('Rådhuset.', () => {}, () => {}, false, undefined, () => {});
  f.flush();
  f.utterances[0].onend?.call(f.utterances[0], {} as SpeechSynthesisEvent);
  f.audio.cancelAnnouncement();
  resolve({ duration: 4.4 });
  await load;
  expect(f.warningPlays).toHaveLength(0);
  expect(f.impacts).toBe(0);
});

test('every station approach plays its original sequence without browser speech, then the warning', () => {
  for (const key of Object.keys(RECORDED_ANNOUNCEMENTS).filter((key) => key.endsWith('Approach')) as Array<keyof typeof RECORDED_ANNOUNCEMENTS>) {
    const f = fixture();
    Object.assign(f.audio, { voice: null });
    f.audio.announce('Station', () => {}, () => {}, true, key, () => {});
    expect(f.recordingPlays).toHaveLength(1);
    expect(f.signals).toBe(0);
    f.recordingSources[0].onended?.();
    f.flush();
    expect(f.utterances).toHaveLength(0);
    expect(f.warningPlays).toHaveLength(1);
  }
});

test('an arrival ends on the recorded station name, with no signal and no browser voice after it', () => {
  const f = fixture();
  f.audio.announce('Västra skogen', () => {}, () => {}, false, 'vastraskogenArrival');
  expect(f.signals).toBe(0);
  f.recordingSources[0].onended?.();
  expect(f.utterances).toHaveLength(0);
  expect(f.warningPlays).toHaveLength(0);
});

test('pausing suspends ambient audio and cancels delayed announcements', () => {
  const f = fixture();
  let suspended = 0;
  f.audio.announce('Station', () => {}, () => {});
  const delayed = f.queued!;
  Object.assign(f.audio, { ctx: { suspend: async () => { suspended++; } } });
  f.audio.suspend();
  delayed();
  expect(suspended).toBe(1);
  expect(f.utterances).toHaveLength(0);
  expect(f.queued).toBeUndefined();
});

test('door buzz plays only across the short warning and closing movement', () => {
  const f = fixture();
  const starts: number[][] = [];
  const source = { buffer: null, connect() { return this; }, start(...args: number[]) { starts.push(args); }, disconnect() {}, onended: null };
  const gain = { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; }, disconnect() {} };
  Object.assign(f.audio, { doorBuffer: { duration: 6.077823 }, ctx: { currentTime: 10, createBufferSource: () => source, createGain: () => gain } });
  f.audio.chime(1);
  expect(starts).toEqual([[0, 0, 2.9]]);
});

test('without the recordings, the chime and the door warning are synthesized, audible and never clipping', () => {
  const ctx = {
    sampleRate: 48000,
    createBuffer: (_channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
    },
  } as unknown as BaseAudioContext;
  for (const [buffer, seconds, fades] of [[synthChime(ctx), 1.6, true], [synthDoorWarning(ctx), DOOR_WARNING + DOOR_SLIDE, false]] as const) {
    const data = buffer.getChannelData(0);
    expect(buffer.duration).toBeCloseTo(seconds, 2);
    const peak = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
    // The chime fades out by itself; the door warning sounds until the doors are shut (`chime` ramps it off).
    if (fades) expect(data.subarray(data.length - 4800).reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThan(peak);
  }
});
