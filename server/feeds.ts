// The Bun relay's feeds (server/ghosts.ts): the shared cache in server/feedCore.ts, with GTFS Regional for the `sl`
// feed when the relay has Trafiklab's keys, its timetable kept in GTFS_FILE (default server/gtfs-timetable.json, not
// committed) so a restart does not download it again. The hub on Cloudflare does the same (worker/hub.ts).

import { sendAlert } from './errorCore';
import { createFeeds } from './feedCore';
import { gtfsDepartures } from './gtfsFeed';
import type { Timetable } from './gtfs';

const RT_KEY = process.env.TRAFIKLAB_RT_KEY;
const STATIC_KEY = process.env.TRAFIKLAB_STATIC_KEY;
const GTFS_FILE = process.env.GTFS_FILE ?? new URL('./gtfs-timetable.json', import.meta.url).pathname;
const log = (message: string) => console.warn(message);

// Production always has both keys. Without them the relay still runs, but no line follows SL, so say so loudly.
if (!RT_KEY || !STATIC_KEY) {
  const missing = [!RT_KEY && 'TRAFIKLAB_RT_KEY', !STATIC_KEY && 'TRAFIKLAB_STATIC_KEY'].filter(Boolean).join(' and ');
  console.warn(`No GTFS: ${missing} not set. No SL feed: every line keeps to the timetable. See docs/DRIFT.md, section 4.`);
}

const ALERT_URL = process.env.ALERT_URL;
const feeds = createFeeds({
  log,
  alert: ALERT_URL ? (title, text) => void sendAlert(ALERT_URL, text, null, log, title) : undefined,
  gtfs: RT_KEY && STATIC_KEY ? gtfsDepartures({ realtime: RT_KEY, static: STATIC_KEY }, {
    read: async () => JSON.parse(await Bun.file(GTFS_FILE).text()) as Timetable,
    write: async (timetable) => { await Bun.write(GTFS_FILE, JSON.stringify(timetable)); },
  }, log) : undefined,
});

/** Answers /feeds/<name>, or returns null for any other path. */
export const handleFeeds = (url: URL, cors: Record<string, string>): Promise<Response | null> => feeds.handle(url, cors);
