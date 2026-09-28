import text from './i18n/sv.json';
import { ARRIVAL_PAUSE, RECORDED_ANNOUNCEMENTS, STATION_RECORDINGS, WARNING_PAUSE, type RecordedAnnouncement } from './announcementSignal';
import type { Network } from './line';
import { PLATFORM_HALF_L, TRAIN_HALF_L } from './layout';
import type { Timetable, TrainState } from './timetable';
import type { Disruption } from './disruptions';

export interface AnnouncementService {
  id: number;
  time: number;
  state: TrainState;
  /** The route this train follows. */
  timetable: Timetable;
}
export interface AnnouncementListener {
  trainId: number | null;
  station: number | null;
  onPlatform: boolean;
}
export interface Announcement {
  key: string;
  text: string;
  /** Optional shorter on-screen text, independent of the spoken message. */
  caption?: string;
  signal: boolean;
  recording?: RecordedAnnouncement;
  /** A stopped train may continue an active notice, but boarding must not start it. */
  startAllowed?: boolean;
  alightingWarning?: boolean;
}

const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
export const NEXT_STOP_PLATFORM_LEAD = 3;
export const T_CENTRALEN_PLATFORM_LEAD = NEXT_STOP_PLATFORM_LEAD;
const WARNING_DURATION = 4.35;
/**
 * The station's name is called this many seconds before the train stops, so
 * it is heard as the train comes to rest, as on the real trains. If the
 * approach and warning run later than that, it follows them at once.
 */
export const ARRIVAL_LEAD = 1;
/** Traffic information only starts with this much of the leg left, so it has time to finish before the next stop is called. */
const TRAFFIC_INFO_LEAD = 25;

const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);

/** SL's traffic information as the train speaker reads it. */
export function trafficNotice(key: string, d: Disruption, startAllowed = true): Announcement {
  return {
    key, signal: true, startAllowed,
    caption: format(text.announcements.trafficInfoCaption, { header: d.header }),
    text: [text.announcements.trafficInfo, sentence(d.header), d.summary].filter(Boolean).join(' '),
  };
}

/**
 * All message eligibility comes from the same timetable state as doors and displays.
 * @param disruption real traffic information, read out once per train and loop between stations
 */
export function announcementAt(net: Network, services: AnnouncementService[], listener: AnnouncementListener, disruption: Disruption | null = null): Announcement | null {
  const onboard = services.find((s) => s.id === listener.trainId);
  if (onboard) {
    const { state, time, id, timetable } = onboard;
    const cycle = Math.floor(time / timetable.cycle);
    const target = state.phase === 'moving' ? state.next : state.stop;
    const stop = timetable.stops[target];
    // The end of this train's route, even where the line itself goes on.
    const terminal = stop.kind === 'station' && stop.terminal;
    const key = `aboard:${id}:${cycle}:${target}`;
    const def = net.stations[stop.station];
    // T-Centralen's recorded approach already names the transfers, so its arrival is the name alone.
    const transferOnApproach = stop.kind === 'station' && def.name === 'T-Centralen';
    const clips = STATION_RECORDINGS[def.name];
    const nextRecording = terminal ? clips?.terminalNext ?? clips?.next : clips?.next;
    // Finish next + warning before switching to a separate arrival notice.
    const arrivalDelay = Math.max(0, (nextRecording ? RECORDED_ANNOUNCEMENTS[nextRecording].duration : 4) + WARNING_PAUSE + WARNING_DURATION + ARRIVAL_PAUSE - NEXT_STOP_PLATFORM_LEAD);
    const nextNotice = (startAllowed: boolean): Announcement => ({
      key: `${key}:next`, signal: true, startAllowed, alightingWarning: true,
      recording: nextRecording,
      caption: [format(text.announcements.next, { station: def.name }), terminal ? text.announcements.leaveTrain : ''].filter(Boolean).join(' '),
      text: [format(text.announcements.next, { station: def.name }), transferOnApproach ? def.transfer : '', terminal ? text.announcements.leaveTrain : ''].filter(Boolean).join(' '),
    });
    const arrivalNotice = (startAllowed: boolean): Announcement => ({
      key: `${key}:arrival`, signal: false, startAllowed,
      caption: [def.name + '.', terminal ? text.announcements.leaveTrain : ''].filter(Boolean).join(' '),
      recording: terminal ? clips?.terminalArrival ?? clips?.arrival : clips?.arrival,
      text: [def.name + '.', transferOnApproach ? '' : def.transfer, terminal ? text.announcements.leaveTrain : ''].filter(Boolean).join(' '),
    });
    const atPlatform = (pose: TrainState) => Math.abs(pose.x - timetable.stationX[stop.station]) <= PLATFORM_HALF_L + TRAIN_HALF_L;
    /** The next-stop call and the warning have had time to finish. */
    const approachDone = () => atPlatform(timetable.stateAt(time - arrivalDelay));
    if (state.phase === 'moving') {
      if (stop.kind === 'station') {
        // Start just before the leading end reaches the platform. Speech continues while rolling in, and the name comes as the train stops.
        if (atPlatform(state)) return approachDone() && timetable.secondsUntil(time, target) <= ARRIVAL_LEAD ? arrivalNotice(true) : nextNotice(false);
        const lead = NEXT_STOP_PLATFORM_LEAD;
        const lookAhead = Math.min(lead, timetable.secondsUntil(time, target));
        if (!atPlatform(timetable.stateAt(time + lookAhead))) {
          // Once started, the message runs on until the next stop is called.
          const early = timetable.secondsUntil(time, target) > TRAFFIC_INFO_LEAD;
          return disruption ? trafficNotice(`traffic:${disruption.id}:${id}:${cycle}`, disruption, early) : null;
        }
        return nextNotice(true);
      }
      return { key: `${key}:turnback`, signal: false, text: text.announcements.turnback };
    }
    if ((state.phase === 'opening' || state.phase === 'dwell') && stop.kind === 'station') {
      return approachDone() ? arrivalNotice(false) : nextNotice(false);
    }
    return null;
  }
  // Platform arrivals are shown on departure boards, without spoken notices or captions.
  return null;
}

/** Never queue messages from competing trains or replay a notice after boarding changes. */
export class AnnouncementTracker {
  private current: Announcement | null = null;
  private readonly seen = new Set<string>();

  update(candidate: Announcement | null): { changed: boolean; event: Announcement | null } {
    if (candidate?.key === this.current?.key) return { changed: false, event: this.current };
    const event = candidate && candidate.startAllowed !== false && !this.seen.has(candidate.key) ? candidate : null;
    const changed = event !== null || this.current !== null;
    this.current = event;
    if (event) {
      this.seen.add(event.key);
      if (this.seen.size > 96) this.seen.delete(this.seen.values().next().value!);
    }
    return { changed, event };
  }
}
