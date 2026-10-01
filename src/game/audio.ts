import { ALIGHTING_WARNING_PATH, ANNOUNCEMENT_SIGNAL_PATH, RECORDED_ANNOUNCEMENTS, RECORDINGS, SIGNAL_SPEECH_GAP, DOOR_WARNING_PATH, WARNING_PAUSE, type RecordedAnnouncement } from './announcementSignal';
import sv from './i18n/sv.json';
import { RIDE_LAYOUT } from './layout';
import { DOOR_SLIDE, DOOR_WARNING } from './timetable';
import type { AudioOut } from './sfx';
import type { Channel } from './settings';

export interface JourneySound {
  trainId: number | null;
  distance: number;
  speed: number;
  braking: number;
  loudness: number;
  aboard: boolean;
}

/**
 * Train motion sound is synthesized. Station announcements use original clips;
 * messages missing from the library use the browser's Swedish voice, as does
 * every call in a build without the recordings (`RECORDINGS`), where the chime
 * and the door warning are synthesized too.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Buses under the master, each with its own volume from the settings. */
  private world!: GainNode;
  private trains!: GainNode;
  private voices!: GainNode;
  private volumes: Record<Channel, number> = { master: 1, announcements: 1, ambience: 1, trains: 1 };
  private exterior!: GainNode;
  private muffler!: BiquadFilterNode;
  private muffled = 0;
  private out: AudioOut | null = null;
  private rumbleGain!: GainNode;
  private rumbleFilter!: BiquadFilterNode;
  private whine!: OscillatorNode;
  private whineGain!: GainNode;
  private muted = false;
  /** People around the player speak aloud (`speak`). Off by default, a switch in the settings. */
  chatter = false;
  private brakeGain: GainNode | null = null;
  private brakeTone: OscillatorNode | null = null;
  private impactNoise: AudioBuffer | null = null;
  private lastRail: number | null = null;
  private soundTrain: number | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private announcementTimer: ReturnType<typeof setTimeout> | null = null;
  private announcementGeneration = 0;
  private finishAnnouncement: (() => void) | null = null;
  private readonly announcementNodes = new Set<AudioBufferSourceNode>();
  private signalBuffer: AudioBuffer | null = null;
  private signalLoad: Promise<AudioBuffer | null> | null = null;
  private readonly recordedBuffers = new Map<RecordedAnnouncement, AudioBuffer>();
  private readonly recordedLoads = new Map<RecordedAnnouncement, Promise<AudioBuffer | null>>();
  private readonly clipLoads = new Map<string, Promise<AudioBuffer | null>>();
  private doorBuffer: AudioBuffer | null = null;
  private warningBuffer: AudioBuffer | null = null;
  private warningLoad: Promise<AudioBuffer | null> | null = null;

  start(): void {
    if (this.ctx) {
      // A phone may refuse to start its audio device (a call, another app): the game plays on silent.
      this.ctx.resume().catch(() => {});
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.masterLevel;
    this.master.connect(ctx.destination);
    this.world = ctx.createGain();
    this.trains = ctx.createGain();
    this.voices = ctx.createGain();
    for (const bus of [this.world, this.trains, this.voices]) bus.connect(this.master);
    this.applyVolumes();
    // The world outside the carriage passes through a filter that closes with the doors.
    this.exterior = ctx.createGain();
    this.muffler = ctx.createBiquadFilter();
    this.muffler.type = 'lowpass';
    this.muffler.frequency.value = 20000;
    this.exterior.connect(this.muffler).connect(this.world);
    if (RECORDINGS) {
      this.signalLoad = this.loadClip(ANNOUNCEMENT_SIGNAL_PATH).then((buffer) => (this.signalBuffer = buffer));
      this.warningLoad = this.loadClip(ALIGHTING_WARNING_PATH).then((buffer) => (this.warningBuffer = buffer));
      void this.loadClip(DOOR_WARNING_PATH).then((buffer) => { this.doorBuffer = buffer; });
      for (const key of this.wanted) void this.loadRecording(key);
    } else {
      this.signalBuffer = synthChime(ctx);
      this.doorBuffer = synthDoorWarning(ctx);
    }

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Brown-ish noise: integrated white noise, kept bounded.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 200;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.05;
    src.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.trains);
    src.start();

    this.whine = ctx.createOscillator();
    this.whine.type = 'sawtooth';
    this.whine.frequency.value = 80;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 900;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(wf).connect(this.whineGain).connect(this.trains);
    this.whine.start();

    this.brakeTone = ctx.createOscillator();
    this.brakeTone.type = 'sine';
    this.brakeTone.frequency.value = 1400;
    this.brakeGain = ctx.createGain();
    this.brakeGain.gain.value = 0;
    this.brakeTone.connect(this.brakeGain).connect(this.trains);
    this.brakeTone.start();
    this.impactNoise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.18), ctx.sampleRate);
    const impact = this.impactNoise.getChannelData(0);
    for (let i = 0; i < impact.length; i++) impact[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.035));

    const pickVoice = () => {
      // Rank Swedish voices: Google's clear female voice first, then Apple's
      // named voices (Alva, Nora, ...), then enhanced/premium variants.
      const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('sv'));
      const score = (v: SpeechSynthesisVoice): number => {
        const n = v.name.toLowerCase();
        if (n.includes('google')) return 4;
        if (/(alva|nora|elin|klara|saga|freja)/.test(n)) return 3;
        if (n.includes('enhanced') || n.includes('premium') || n.includes('siri')) return 2;
        return 1;
      };
      this.voice = voices.sort((a, b) => score(b) - score(a))[0] ?? null;
    };
    if ('speechSynthesis' in window) {
      pickVoice();
      speechSynthesis.addEventListener('voiceschanged', pickVoice);
    }
  }

  private loadClip(path: string): Promise<AudioBuffer | null> {
    const cached = this.clipLoads.get(path);
    if (cached) return cached;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const load = fetch(`${import.meta.env.BASE_URL}${path}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Announcement: HTTP ${response.status}`);
        return ctx.decodeAudioData(await response.arrayBuffer());
      })
      .catch((error: unknown) => { console.warn('Announcement clip could not load', path, error); return null; });
    this.clipLoads.set(path, load);
    return load;
  }

  /** Recordings to warm, for the line the player is on: fetched once sound is on, never the entire library. */
  private wanted: RecordedAnnouncement[] = [];

  preload(keys: RecordedAnnouncement[]): void {
    this.wanted = keys;
    if (this.ctx) for (const key of keys) void this.loadRecording(key);
  }

  private loadRecording(key: RecordedAnnouncement): Promise<AudioBuffer | null> {
    const cached = this.recordedLoads.get(key);
    if (cached) return cached;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const { parts } = RECORDED_ANNOUNCEMENTS[key];
    const load = Promise.all(parts.map((part) => (typeof part === 'string' ? this.loadClip(part) : Promise.resolve(part)))).then((clips) => {
      if (clips.some((clip) => !clip)) return null;
      // Numbers are pauses, in seconds of silence.
      const decoded = clips as Array<AudioBuffer | number>;
      const lengthOf = (clip: AudioBuffer | number) => (typeof clip === 'number' ? Math.round(clip * ctx.sampleRate) : clip.length);
      const buffer = ctx.createBuffer(1, decoded.reduce<number>((length, clip) => length + lengthOf(clip), 0), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let offset = 0;
      for (const clip of decoded) {
        if (typeof clip !== 'number') samples.set(clip.getChannelData(0), offset);
        offset += lengthOf(clip);
      }
      this.recordedBuffers.set(key, buffer);
      return buffer;
    });
    this.recordedLoads.set(key, load);
    return load;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * The running audio graph for other sounds, or null before the first click.
   * The same object every frame, so consumers can build their graph once per context.
   */
  get output(): AudioOut | null {
    if (!this.ctx) return null;
    if (this.out?.ctx !== this.ctx) this.out = { ctx: this.ctx, bus: this.exterior, cabin: this.world };
    return this.out;
  }

  /**
   * How shut in the listener is: 0 out on the platform or with the doors
   * open, 1 inside a train with its doors closed. The platform's sound floods
   * in as the doors open and turns dull again as they close.
   */
  setMuffle(amount: number): void {
    if (!this.ctx || Math.abs(amount - this.muffled) < 0.01) return;
    this.muffled = amount;
    const t = this.ctx.currentTime;
    this.muffler.frequency.setTargetAtTime(20000 * Math.pow(650 / 20000, amount), t, 0.12);
    this.exterior.gain.setTargetAtTime(1 - 0.45 * amount, t, 0.12);
  }

  /** An eerie, slowed synthetic voice (Silverpilen). Nothing is spoken while muted. */
  whisper(text: string): void {
    if (this.muted || !this.ctx || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'sv-SE';
    if (this.voice) u.voice = this.voice;
    u.rate = 0.62;
    u.pitch = 0.3;
    u.volume = 0.7 * this.volumes.master * this.volumes.ambience;
    speechSynthesis.speak(u);
  }

  /**
   * A short line in a passer-by's voice (not an announcement), only with `chatter` on: browser speech is the
   * announcer's voice again, heard from nowhere in particular, so people keep to the captions unless asked.
   */
  speak(text: string, pitch = 1, rate = 1, volume = 0.6, lang = 'sv-SE'): void {
    if (this.chatter) this.utter(text, pitch, rate, volume, lang);
  }

  /** Something the player chose to hear read aloud, such as an art plaque. */
  read(text: string): void {
    this.utter(text, 1, 1, 0.8, 'sv-SE');
  }

  /** Nothing is spoken while muted, nor in Swedish without a Swedish voice: another language's voice mangles it. */
  private utter(text: string, pitch: number, rate: number, volume: number, lang: string): void {
    if (this.muted || !this.ctx || !('speechSynthesis' in window)) return;
    if (lang === 'sv-SE' && !this.voice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    if (lang === 'sv-SE') u.voice = this.voice;
    u.pitch = pitch;
    u.rate = rate;
    u.volume = volume * this.volumes.master * this.volumes.ambience;
    speechSynthesis.speak(u);
  }

  suspend(): void {
    this.cancelAnnouncement();
    if (this.ctx) void this.ctx.suspend();
  }

  private get masterLevel(): number {
    return this.muted ? 0 : 0.8 * this.volumes.master;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.masterLevel, t, 0.05);
    this.world.gain.setTargetAtTime(this.volumes.ambience, t, 0.05);
    this.trains.gain.setTargetAtTime(this.volumes.trains, t, 0.05);
    this.voices.gain.setTargetAtTime(this.volumes.announcements, t, 0.05);
  }

  /** The master volume and each bus's, 0 to 1. */
  setVolumes(volumes: Record<Channel, number>): void {
    this.volumes = { ...volumes };
    this.applyVolumes();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, 0.05);
    if (this.muted) this.cancelAnnouncement();
    return this.muted;
  }

  /**
   * @param loudness 0..1, how much train noise reaches the listener
   * @param speed 0..1 of line speed for the dominant train
   * @param aboard whether the listener rides that train
   */
  setTrainNoise(loudness: number, speed: number, aboard: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(0.04 + loudness * 0.55, t, 0.15);
    this.rumbleFilter.frequency.setTargetAtTime(140 + speed * (aboard ? 380 : 700), t, 0.2);
    this.whine.frequency.setTargetAtTime(70 + speed * 620, t, 0.2);
    this.whineGain.gain.setTargetAtTime(speed > 0.02 ? loudness * (0.012 + speed * 0.02) : 0, t, 0.2);
  }

  /** Distance-driven wheel joints stay tied to actual train motion. */
  updateJourney(sound: JourneySound): void {
    if (!this.ctx) return;
    const { speed, braking, aboard, loudness } = sound;
    const t = this.ctx.currentTime;
    const brake = speed > 0.3 && speed < 14 && braking > 0.2 ? Math.min(1, braking) * Math.sin(Math.min(1, speed / 14) * Math.PI) : 0;
    this.brakeGain?.gain.setTargetAtTime(brake * loudness * (aboard ? 0.018 : 0.04), t, 0.12);
    this.brakeTone?.frequency.setTargetAtTime(1000 + speed * 48, t, 0.12);
    const rail = Math.floor(sound.distance / RIDE_LAYOUT.railSpacing);
    if (!this.muted && sound.trainId === this.soundTrain && this.lastRail !== null && Math.abs(rail - this.lastRail) === 1 && speed > 0.5) {
      this.impact(loudness * (aboard ? 0.11 : 0.06), aboard ? 480 : 850, 0);
      this.impact(loudness * (aboard ? 0.08 : 0.04), aboard ? 360 : 700, 0.09);
    }
    this.soundTrain = sound.trainId;
    this.lastRail = rail;
  }

  private impact(volume: number, frequency: number, delay: number): void {
    if (!this.ctx || !this.impactNoise || volume < 0.001) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.impactNoise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.trains);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(ctx.currentTime + delay);
  }

  /** The C20's door closing warning: the original clip, or a synthesized one in a build without the recordings. */
  chime(volume: number): void {
    if (!this.ctx || !this.doorBuffer || this.muted || volume <= 0.01) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.doorBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume * 0.65;
    source.connect(gain).connect(this.trains);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    const duration = Math.min(this.doorBuffer.duration, DOOR_WARNING + DOOR_SLIDE);
    const end = this.ctx.currentTime + duration;
    gain.gain.setValueAtTime(volume * 0.65, end - 0.08);
    gain.gain.linearRampToValueAtTime(0, end);
    source.start(0, 0, duration);
  }

  private playSignal(buffer: AudioBuffer): void {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.65;
    source.connect(gain).connect(this.voices);
    this.announcementNodes.add(source);
    source.onended = () => { this.announcementNodes.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  cancelAnnouncement(): void {
    this.announcementGeneration++;
    if (this.announcementTimer !== null) clearTimeout(this.announcementTimer);
    this.announcementTimer = null;
    for (const node of this.announcementNodes) node.stop();
    this.announcementNodes.clear();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.finishAnnouncement?.();
    this.finishAnnouncement = null;
  }

  announce(text: string, onStart: () => void, onEnd: () => void, withSignal = false, recording?: RecordedAnnouncement, onWarning?: () => void): void {
    this.cancelAnnouncement();
    this.finishAnnouncement = onEnd;
    // Subtitles still work without an audio context or an installed Swedish voice.
    if (this.muted || !this.ctx) {
      onStart();
      return;
    }
    const generation = this.announcementGeneration;
    const active = () => generation === this.announcementGeneration && !this.muted;
    const finish = () => {
      if (!active()) return;
      this.finishAnnouncement = null;
      onEnd();
    };
    const playClip = (buffer: AudioBuffer, offset: number, duration: number, speechDelay: number, started: () => void, ended: () => void) => {
      if (!active() || !this.ctx) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.85;
      source.connect(gain).connect(this.voices);
      this.announcementNodes.add(source);
      source.onended = () => {
        this.announcementNodes.delete(source);
        source.disconnect();
        gain.disconnect();
        if (!active()) return;
        if (this.announcementTimer !== null) clearTimeout(this.announcementTimer);
        this.announcementTimer = null;
        ended();
      };
      source.start(0, offset, duration);
      if (speechDelay === 0) started();
      else this.announcementTimer = setTimeout(() => {
        this.announcementTimer = null;
        if (active()) started();
      }, speechDelay * 1000);
    };
    const afterSpeech = () => {
      if (!active()) return;
      if (!onWarning) { finish(); return; }
      // A breath between the station call and the warning, as on the real trains.
      const warn = (buffer: AudioBuffer | null) => {
        if (!active()) return;
        if (!buffer) { finish(); return; }
        this.announcementTimer = setTimeout(() => {
          this.announcementTimer = null;
          if (active()) playClip(buffer, 0, buffer.duration, 0, onWarning, finish);
        }, WARNING_PAUSE * 1000);
      };
      if (this.warningBuffer) warn(this.warningBuffer);
      else if (this.warningLoad) void this.warningLoad.then(warn);
      else this.announcementTimer = setTimeout(() => {
        // No recording of the warning: the browser's voice says it.
        this.announcementTimer = null;
        if (!active()) return;
        if (!this.voice || !('speechSynthesis' in window)) { onWarning(); finish(); return; }
        const u = new SpeechSynthesisUtterance(sv.announcements.alightingWarning);
        u.lang = 'sv-SE';
        u.voice = this.voice;
        u.volume = this.volumes.master * this.volumes.announcements;
        u.onstart = () => { if (active()) onWarning(); };
        u.onend = finish;
        u.onerror = finish;
        speechSynthesis.speak(u);
      }, WARNING_PAUSE * 1000);
    };
    const begin = (buffer: AudioBuffer | null) => {
      // Loading must not resurrect an announcement after the listener has moved away.
      if (generation !== this.announcementGeneration || this.muted) return;
      if (buffer) this.playSignal(buffer);
      const delay = buffer ? buffer.duration + SIGNAL_SPEECH_GAP : 0;
      this.announcementTimer = setTimeout(() => {
        this.announcementTimer = null;
        if (generation !== this.announcementGeneration || this.muted) return;
        if (!this.voice || !('speechSynthesis' in window)) { onStart(); if (onWarning) afterSpeech(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'sv-SE';
        u.voice = this.voice;
        u.rate = 1;
        u.pitch = 1;
        u.volume = this.volumes.master * this.volumes.announcements;
        u.onstart = () => { if (generation === this.announcementGeneration) onStart(); };
        u.onend = afterSpeech;
        u.onerror = () => { if (generation === this.announcementGeneration) onStart(); };
        speechSynthesis.speak(u);
      }, delay * 1000);
    };
    const synthesized = () => {
      if (!withSignal) begin(null);
      else if (this.signalBuffer) begin(this.signalBuffer);
      else if (this.signalLoad) void this.signalLoad.then(begin);
      else begin(null);
    };
    if (!recording) { synthesized(); return; }
    const playRecording = (buffer: AudioBuffer | null) => {
      if (generation !== this.announcementGeneration || this.muted || !this.ctx) return;
      if (!buffer) { synthesized(); return; }
      playClip(buffer, 0, buffer.duration, RECORDED_ANNOUNCEMENTS[recording].speechDelay, onStart, afterSpeech);
    };
    const buffer = this.recordedBuffers.get(recording);
    if (buffer) playRecording(buffer);
    else void this.loadRecording(recording).then(playRecording);
  }
}

/** The two-note chime before an announcement, for a build without the recordings: a soft high and a lower note. */
export function synthChime(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.ceil(rate * 1.6), rate);
  const data = buffer.getChannelData(0);
  const notes = [{ at: 0, f: 1046.5 }, { at: 0.42, f: 784 }];
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    let v = 0;
    for (const n of notes) {
      const u = t - n.at;
      if (u < 0) continue;
      // A bell: the note and a quieter octave, a quick attack and a slow fade.
      const env = Math.min(1, u / 0.01) * Math.exp(-u * 3.2);
      v += env * (Math.sin(2 * Math.PI * n.f * u) + 0.25 * Math.sin(4 * Math.PI * n.f * u));
    }
    data[i] = v * 0.28;
  }
  return buffer;
}

/** The door closing warning, for a build without the recordings: quick beeps while the doors close. */
export function synthDoorWarning(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const seconds = DOOR_WARNING + DOOR_SLIDE;
  const buffer = ctx.createBuffer(1, Math.ceil(rate * seconds), rate);
  const data = buffer.getChannelData(0);
  const period = 0.25, on = 0.14;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const u = t % period;
    if (u > on) continue;
    const env = Math.min(1, u / 0.005, (on - u) / 0.01);
    data[i] = env * 0.3 * (Math.sin(2 * Math.PI * 1320 * t) + 0.3 * Math.sin(2 * Math.PI * 2640 * t));
  }
  return buffer;
}
