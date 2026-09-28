import text from './i18n/sv.json';
import { CLIP_SECONDS } from './clips';
import { NETWORK } from './line';

/**
 * Whether this build has the recorded announcements (`public/audio/`, the Utrop library). A build with RECORDINGS=0
 * (vite.config.ts) leaves them out while they await the rights holder's approval: every call is spoken by the
 * browser's Swedish voice, and the chime and the door warning are synthesized (`audio.ts`).
 */
export const RECORDINGS: boolean = __RECORDINGS__;

/** Original, unedited recordings from the user's Utrop library. */
export const ANNOUNCEMENT_SIGNAL_PATH = 'audio/ding.mp3';
export const SIGNAL_SPEECH_GAP = 0.1;
export const ALIGHTING_WARNING_PATH = 'audio/avstandet.mp3';
export const DOOR_WARNING_PATH = 'audio/buzz.mp3';

/** Silence after a station name before what follows it: "T-Centralen. Byte till ...". */
export const NAME_PAUSE = 0.35;
/** Silence between the station call and "Tänk på avståndet ...". */
export const WARNING_PAUSE = 0.7;
/** Silence between the warning and the station name on arrival. */
export const ARRIVAL_PAUSE = 1.2;

interface Recording {
  /** Clip paths, in order, and seconds of silence between them. */
  parts: Array<string | number>;
  paths: string[];
  duration: number;
  speechDelay: number;
}

const transfer = ['bytetill', 'ovrigatunnelbana'];
const centralTransfer = [...transfer, 'och', 'pendeltag'];
/** @param duration the clips' total length; pauses are added to it */
const recording = (clips: Array<string | number>, duration: number): Recording => {
  const parts = clips.map((clip) => (typeof clip === 'number' ? clip : `audio/${clip}.mp3`));
  return {
    parts,
    paths: parts.filter((part): part is string => typeof part === 'string'),
    duration: duration + clips.reduce<number>((sum, clip) => sum + (typeof clip === 'number' ? clip : 0), 0),
    speechDelay: clips[0] === 'nasta' ? 0.8 : 0,
  };
};

/** Source clips are joined in memory, never exported as generated audio files. */
const BLUE_RECORDINGS = {
  kungstradgardenApproach: recording(['nasta', 'kungstradgarden'], 3),
  kungstradgardenTerminalApproach: recording(['nasta', 'kungstradgarden', NAME_PAUSE, 'slutstation'], 7.61),
  tCentralenApproach: recording(['nasta', 'tcentralen', NAME_PAUSE, ...centralTransfer], 6.67),
  tCentralenArrival: recording(['tcentralen'], 1.16),
  radhusetApproach: recording(['nasta', 'radhuset'], 3),
  fridhemsplanApproach: recording(['nasta', 'fridhemsplan'], 3.01),
  kungstradgardenArrival: recording(['kungstradgarden'], 2),
  kungstradgardenTerminalArrival: recording(['kungstradgarden', NAME_PAUSE, 'slutstation'], 5.85),
  radhusetArrival: recording(['radhuset'], 2),
  fridhemsplanArrival: recording(['fridhemsplan', NAME_PAUSE, ...transfer], 3.72),
  stadshagenApproach: recording(['nasta', 'stadshagen'], 2.95),
  stadshagenArrival: recording(['stadshagen'], 2),
  vastraskogenApproach: recording(['nasta', 'vastraskogen'], 3.05),
  vastraskogenArrival: recording(['vastraskogen'], 2),
  solnacentrumApproach: recording(['nasta', 'solnacentrum'], 3.11),
  solnacentrumArrival: recording(['solnacentrum'], 1.36),
  nackrosenApproach: recording(['nasta', 'nackrosen'], 2.91),
  nackrosenArrival: recording(['nackrosen'], 1.16),
  hallonbergenApproach: recording(['nasta', 'hallonbergen'], 2.91),
  hallonbergenArrival: recording(['hallonbergen'], 1.16),
  kistaApproach: recording(['nasta', 'kista'], 2.61),
  kistaArrival: recording(['kista'], 0.86),
  husbyApproach: recording(['nasta', 'husby'], 2.51),
  husbyArrival: recording(['husby'], 0.76),
  akallaTerminalApproach: recording(['nasta', 'akalla', NAME_PAUSE, 'slutstation'], 7.31),
  akallaTerminalArrival: recording(['akalla', NAME_PAUSE, 'slutstation'], 5.56),
  huvudstaApproach: recording(['nasta', 'huvudsta'], 2.61),
  huvudstaArrival: recording(['huvudsta'], 0.86),
  sundbybergApproach: recording(['nasta', 'sundbybergscentrum'], 3.31),
  sundbybergArrival: recording(['sundbybergscentrum', NAME_PAUSE, 'bytetill', 'pendeltag', 'och', 'tvarbanan'], 4.61),
  duvboApproach: recording(['nasta', 'duvbo'], 2.51),
  duvboArrival: recording(['duvbo'], 0.76),
  rissneApproach: recording(['nasta', 'rissne'], 2.61),
  rissneArrival: recording(['rissne'], 0.86),
  rinkebyApproach: recording(['nasta', 'rinkeby'], 2.81),
  rinkebyArrival: recording(['rinkeby'], 1.06),
  tenstaApproach: recording(['nasta', 'tensta'], 2.51),
  tenstaArrival: recording(['tensta'], 0.76),
  hjulstaTerminalApproach: recording(['nasta', 'hjulsta', NAME_PAUSE, 'slutstation'], 7.41),
  hjulstaTerminalArrival: recording(['hjulsta', NAME_PAUSE, 'slutstation'], 5.66),
} as const;

/** The library's clip for a station's name: lowercase, without accents or spaces. */
export function clipName(station: string): string {
  if (station === 'S:t Eriksplan') return 'sankteriksplan';
  return station.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
}

/** What each transfer notice sounds like, pieced together from the library. */
const TRANSFER_CLIPS: Record<string, string[]> = {
  [text.announcements.tCentralenTransfer]: centralTransfer,
  [text.announcements.fridhemsplanTransfer]: transfer,
  [text.announcements.otherMetro]: transfer,
  [text.announcements.slussenTransfer]: [...transfer, 'och', 'saltsjobanan'],
  [text.announcements.ropstenTransfer]: ['bytetill', 'lidingobanan'],
  [text.announcements.roslagsbanaTransfer]: ['bytetill', 'roslagsbanan'],
  [text.announcements.tvarbanaTransfer]: ['bytetill', 'tvarbanan'],
  [text.announcements.alvikTransfer]: ['bytetill', 'tvarbanan', 'och', 'nockebybanan'],
  [text.announcements.pendeltagTransfer]: ['bytetill', 'pendeltag'],
};

type Clips = { next: string; arrival: string; terminalNext?: string; terminalArrival?: string };

/**
 * The red and green lines' calls, built the same way as the blue line's:
 * "Nästa" and the name, the name and its transfers on arrival, and
 * "slutstation" where a route ends.
 */
function generated(): { recordings: Record<string, Recording>; stations: Record<string, Clips> } {
  const recordings: Record<string, Recording> = {};
  const stations: Record<string, Clips> = {};
  const seconds = (clips: Array<string | number>) => clips.reduce<number>((sum, c) => sum + (typeof c === 'number' ? 0 : CLIP_SECONDS[c] ?? 0), 0);
  const add = (key: string, clips: Array<string | number>) => { recordings[key] = recording(clips, seconds(clips)); return key; };
  for (const s of NETWORK.stations) {
    if (s.line === 0 || stations[s.name]) continue;
    const clip = clipName(s.name);
    if (!(clip in CLIP_SECONDS)) continue;
    const change = s.transfer ? TRANSFER_CLIPS[s.transfer] ?? [] : [];
    const terminal = NETWORK.routes.some((r) => r.line === s.line && (r.outbound === s.name || r.inbound === s.name));
    stations[s.name] = {
      next: add(`${clip}Approach`, ['nasta', clip]),
      arrival: add(`${clip}Arrival`, change.length ? [clip, NAME_PAUSE, ...change] : [clip]),
      ...(terminal ? {
        terminalNext: add(`${clip}TerminalApproach`, ['nasta', clip, NAME_PAUSE, 'slutstation']),
        terminalArrival: add(`${clip}TerminalArrival`, [clip, NAME_PAUSE, 'slutstation']),
      } : {}),
    };
  }
  return { recordings, stations };
}

const GENERATED = generated();

export const RECORDED_ANNOUNCEMENTS: Readonly<Record<string, Recording>> = RECORDINGS ? { ...BLUE_RECORDINGS, ...GENERATED.recordings } : {};
export type RecordedAnnouncement = string;

/**
 * Per station: the next-station clip and the arrival clip, and at a route's
 * terminal the versions that add "slutstation". Every call at a station ends
 * on the station's own recorded name. Solna strand has no clip in the
 * library, so its name is spoken by the browser.
 */
export const STATION_RECORDINGS: Readonly<Record<string, Clips>> = !RECORDINGS ? {} : {
  ...GENERATED.stations,
  'Kungsträdgården': { next: 'kungstradgardenApproach', arrival: 'kungstradgardenArrival', terminalNext: 'kungstradgardenTerminalApproach', terminalArrival: 'kungstradgardenTerminalArrival' },
  'T-Centralen': { next: 'tCentralenApproach', arrival: 'tCentralenArrival' },
  'Rådhuset': { next: 'radhusetApproach', arrival: 'radhusetArrival' },
  'Fridhemsplan': { next: 'fridhemsplanApproach', arrival: 'fridhemsplanArrival' },
  'Stadshagen': { next: 'stadshagenApproach', arrival: 'stadshagenArrival' },
  'Västra skogen': { next: 'vastraskogenApproach', arrival: 'vastraskogenArrival' },
  'Solna centrum': { next: 'solnacentrumApproach', arrival: 'solnacentrumArrival' },
  'Näckrosen': { next: 'nackrosenApproach', arrival: 'nackrosenArrival' },
  'Hallonbergen': { next: 'hallonbergenApproach', arrival: 'hallonbergenArrival' },
  'Kista': { next: 'kistaApproach', arrival: 'kistaArrival' },
  'Husby': { next: 'husbyApproach', arrival: 'husbyArrival' },
  'Akalla': { next: 'akallaTerminalApproach', arrival: 'akallaTerminalArrival', terminalNext: 'akallaTerminalApproach', terminalArrival: 'akallaTerminalArrival' },
  'Huvudsta': { next: 'huvudstaApproach', arrival: 'huvudstaArrival' },
  'Sundbybergs centrum': { next: 'sundbybergApproach', arrival: 'sundbybergArrival' },
  'Duvbo': { next: 'duvboApproach', arrival: 'duvboArrival' },
  'Rissne': { next: 'rissneApproach', arrival: 'rissneArrival' },
  'Rinkeby': { next: 'rinkebyApproach', arrival: 'rinkebyArrival' },
  'Tensta': { next: 'tenstaApproach', arrival: 'tenstaArrival' },
  'Hjulsta': { next: 'hjulstaTerminalApproach', arrival: 'hjulstaTerminalArrival', terminalNext: 'hjulstaTerminalApproach', terminalArrival: 'hjulstaTerminalArrival' },
};
