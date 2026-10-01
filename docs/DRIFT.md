# Hosting

How Under Stockholm runs in production on Cloudflare: on Workers Paid ($5 a month plus use), with no server to maintain and a daily budget so no bill can surprise you.

## What runs where

| Part | Where | Limits | If it takes off |
|---|---|---|---|
| Game (`dist/`) | Worker static assets | Free, unlimited | Same |
| Other players, notes, clock, performance and error reports (`/ghosts`, `/notes`, `/perf`, `/errors`) | The same Worker, in front of one Durable Object, the hub (`worker/`) | Two daily budgets (`GHOST_BUDGET`, a million requests for other players, `DATA_BUDGET`, 300,000 for the rest) and a share of the day per address: when one is spent, that part pauses until midnight UTC | A higher `GHOST_BUDGET`, then shards (section 3) |
| Live data (`/feeds/*`) | The hub fetches the sources, each data center caches its answers | Free, however many play | Same |

Why this shape:

- **One origin.** The game, the relay and the feeds share understockholm.com, as they share the dev server in development (`scripts/dev.ts` proxies the same paths to the Bun relay), so the client has no addresses to configure: `ghostUrl()` in `src/game/relay.ts` is the page's own origin (`VITE_GHOSTS_URL` still overrides it, `off` turns the relay off).
- **The game and the live data never stop.** Only other players are limited, and they are a bonus: when they pause, the game plays exactly as before.
- **Sources see a fixed load.** Only the hub asks SL, Trafiklab, SMHI, Open-Meteo and Sveriges Radio, once per feed's interval for everyone and only while someone asks. Browsers never call them, so visitors' addresses stay with Cloudflare.
- **No server** to patch, restart or pay for.

The Bun relay (`server/ghosts.ts`) and the hub (`worker/hub.ts`) share their logic: `server/pose.ts` (other players), `server/feedCore.ts` (the feed cache), `server/gtfsFeed.ts` (GTFS Regional), `server/perfCore.ts` (performance reports) and `server/errorCore.ts` (error reports). Only where they keep things differs: files for the Bun relay, the Durable Object's SQLite storage for the hub.

## 1. Deploying

`bun run deploy` (`scripts/deploy.ts`) is the only way: it needs a clean tree with HEAD pushed, runs the whole quality gate, builds with the real address and uploads with `bunx wrangler deploy` (Wrangler is a dev dependency; log in once with `bunx wrangler login`). `wrangler.jsonc` makes the game a Worker that serves `dist` as static assets on understockholm.com and www.understockholm.com (registered at Spaceship, DNS on Cloudflare), and on `under-stockholm.<account>.workers.dev` for testing. Only the relay's paths (`run_worker_first`) run the Worker; every other request is a file and costs nothing. `--dry-run` does everything but the upload.

- **Without the recorded announcements, by default.** The recordings of the Utrop library stay on the developer's machine, out of git: SL does not own the voice and declined to approve it, so a plain `bun run deploy` builds with `RECORDINGS=0`: every call is spoken by the browser's Swedish voice, the chime and the door warning are synthesized, and no clip of the Utrop library is built or uploaded (the deploy checks). The recorded sounds of people in `audio/sfx/` are free to use and go out. `--with-recordings` would put them out: never, unless the rights holder clears them.
- **`--landing`** deploys the landing page alone, without the game (`LANDING_ONLY=1`).
- **Secrets, once**, with `bunx wrangler secret put <name>`: `TRAFIKLAB_RT_KEY` and `TRAFIKLAB_STATIC_KEY` (GTFS Regional, section 4; without them only the blue line follows SL, from the Transport API) and `NOTES_ADMIN_TOKEN` (to take a note down with `DELETE /notes/<id>`). Never in the client, never with a `VITE_` prefix.
- **Do not connect the repository for deploys on push** (Cloudflare's Git integration, or Pages builds): a push only runs the quick gates, and a deploy must pass all of them.
- **Locally**, `bunx wrangler dev --port 8911` runs the Worker and the hub on the last build in `dist/` (it reads the Trafiklab keys from `.env.local`). `bun run serve:prod` serves the build with the Bun relay behind the same paths, which is what the quality gate measures.

## 2. The hub: other players, notes, clock and feeds

`worker/index.ts` sends `/ghosts`, `/notes`, `/perf`, `/errors` and `/feeds/*` to one Durable Object, the hub (`worker/hub.ts`, SQLite storage, available on the free plan). It keeps the Bun relay's protocol and answers.

- **Other players.** Plain WebSockets (not the Hibernation API: the hub broadcasts continuously and could never hibernate), ticked with `setInterval` while anyone is connected (alarms would bill a request and a write each). Players send their pose twice a second and get a snapshot twice a second (`TICK_MS` in `server/pose.ts`, `SEND_EVERY` in `src/game/ghosts.ts`); the client draws others 0.8 s behind, between two snapshots. Each player gets the 48 nearest along the line (`MAX_SENT`), found from one sort by x per tick. At most `MAX_CLIENTS` (200) at once: past that a socket is accepted and closed with code 4001, and the client waits a minute or two.
- **Notes**, **performance reports** and **error reports** go to the hub's SQLite storage, with the same filter and per-address limits as the Bun relay. The page at `/perf` is how the launch is judged, and `/errors` groups what went wrong in players' games (at most three reports per visit). Both reports carry the client's Git build version. `/perf` also separates the 12 most recently seen build and battery saver groups, so an intended 30 fps is not read as a regression; older reports and visits that switched mode stay in an unknown or changed group. `/errors` groups asset failures without their build hashes and shows each group's counts per client version.
- **Feeds.** The same cache as the Bun relay (`server/feedCore.ts`): each feed is fetched at most once per interval (SL every 15 s from GTFS, traffic information every 2 minutes, warnings every 5, weather every 15, news every 30), only while someone asks, concurrent requests share one fetch, a failed source is left alone for a while (longer with `Retry-After`) and the last good copy is served until it is too old. The Worker keeps each answer in the data center's cache for as long as it is fresh, so the hub hears from each data center once per interval, however many ask.

## 3. Rate limits

From cheap to dear:

1. **The sources** are asked by the hub alone, on the intervals above, and SL's keyless Transport API within 12 requests a minute (`SL_PER_MINUTE`). Trafiklab's Silver quota allows 250 realtime requests a minute; the hub uses 4.
2. **Feeds** are answered from each data center's cache; the query string is left out of the cache key, so it cannot be used to get past it. A feed that does not exist is answered by the Worker, and a feed the cache does not hold counts against the address below.
3. **Per address** (`LIMIT` in `wrangler.jsonc`, Cloudflare's rate limiting binding): 120 requests a minute to what would reach the hub (sockets, notes, reports, feeds not in the cache). A player uses a few a minute; the rest is room for a school or a mobile operator's shared address. Past it, `429` with `Retry-After`. An address is IPv4 as it is and IPv6 by its /64 (`addressKey` in `server/limits.ts`), since one home or phone is handed a whole /64. A POST must say its length and be at most 16 KB (`MAX_BODY`), or it never reaches the hub.
4. **A share of the day per address** (`ADDRESS_DAY` and `BLOCK_DAY` in `server/limits.ts`): 30,000 billed requests a day per address (a request, or twenty socket messages), and 200,000 per IPv6 /48 together, so taking new /64s from one block does not reset it. The per-minute limit alone lets one address spend some 170,000 a day, and its 16 sockets as much again, so without this a handful of addresses could spend the day's budget for everyone. A busy classroom behind one address stays well under it. Past it the hub refuses the address (sockets closed with code 4000, so the game waits for midnight, the rest `429`) and says so in `x-spent-until` and `x-spent-scope`; the Worker then keeps that answer in the data center's cache until midnight UTC and turns the address, or its whole /48, away itself, so what it sends after costs the hub nothing. The hub keeps the counts in memory (a restart forgives), and past 100,000 addresses a day newcomers share one count.
5. **In the hub**: a note per address every 90 s and at most 30 an hour from everyone, a performance report per address a minute, an error report per address every 10 s. The `/perf` and `/errors` pages are rebuilt at most once a minute (`AGGREGATE_MS` in `server/limits.ts`), since a build reads every kept report. At most 16 sockets per address (`MAX_PER_ADDRESS`, a classroom), so one address cannot take the 200 places. Per socket a burst of 10 messages refilled at 4 a second (twice what the game sends), anything longer than 256 bytes or not a pose ignored, and a socket more than 20 messages past that in half a second closed with code 4002: dropped messages are billed all the same. Spam on the boards goes with `DELETE /notes?since=<epoch ms>` (with `NOTES_ADMIN_TOKEN`).
6. **The day's budgets**, two so that neither can spend the other. The hub counts what it is billed for: every request that reaches it, and incoming WebSocket messages divided by 20. `GHOST_BUDGET` (1,000,000 requests a day to Durable Objects on Workers Paid; the hub falls back to 90,000, within the free plan's 100,000, if it is unset) holds the sockets and their messages: near it the hub closes the other players' sockets with code 4000 and refuses new ones the same way, and the client waits for midnight UTC. `DATA_BUDGET` (300,000; no ceiling if unset, as on the free plan) holds the feeds, notes and reports: near it they answer `503` until midnight, and the game keeps to the timetable. The `/perf` page shows the day's spending against both, and the hub writes a line to Workers Logs as the day passes 80% and 100% of either (`budget: 80% of ...`).

`scripts/worker-check.ts`, in `bun run check`'s quick gates, runs the Worker and the hub in `wrangler dev` with the shares and budgets set small (`ADDRESS_DAY`, `BLOCK_DAY`, `GHOST_BUDGET`, `DATA_BUDGET` as vars) and checks 4, 6 and the Worker's part of it end to end.

That is about 2,700 player-hours of other players a day, at most about $0.15 a day in Durable Object requests past the plan's included million a month, and $0.05 more for the feeds, notes and reports. Raise `GHOST_BUDGET` in `wrangler.jsonc` and deploy if players pause too early (3,000,000 a day is some 8,000 player-hours and at most about $0.45 a day). Keep a number rather than `off`: Workers Paid has no ceiling of its own, and the budget is what stops a flood from turning into a bill. Set a billing notification in Cloudflare's dashboard as well. A rate limiting rule in Cloudflare's WAF on `/feeds/*` stops a loop before it even runs the Worker.

### If it takes off: shards

Past about 200 players at once, split other players over several objects:

- **One shard per stretch of the line.** The client only shows the 48 nearest, so players far apart never need to share an object. The Worker routes `/ghosts?zone=<n>` to the object named `ghosts-<n>`; a zone is a few neighbouring stations and their tunnels, derived from x the same way on client and server. The hub (notes, clock, feeds) stays its own object.
- **Changing zone.** When the player (or the train they ride) crosses into another zone, the client opens the new socket and closes the old one once the new one has said hello, so nobody blinks out. Near a border, also listen to the neighbouring zone, or let zones overlap by a station.
- **Full zones overflow.** Past about 200 players, a zone opens `ghosts-<n>-2` and so on, filled in order.
- **The count.** Each shard reports its player count to the hub now and then, and the hello carries the total, so "N others in the metro" still means everyone.

## 4. SL data from GTFS Regional

Trafiklab's recommended source for a whole line is GTFS Regional: one request gives every trip, updated every 15 s. Both relays use it (`server/gtfs.ts`, `server/gtfsFeed.ts`) whenever both keys are set, and fall back to the Transport API while the timetable downloads or when a realtime fetch fails. It runs in the hub on the free plan too: a Durable Object gets 30 s of CPU per request on every plan (reading the timetable takes about 1.3 s, decoding the realtime feed a few milliseconds). The client does not change: `feeds/sl` keeps its shape.

**In the relay.** Once a day it downloads `sl.zip` and reads the metro's trips, every line in the game (about 7,300, in about a second), as it downloads: SL's export gives each file's size only after it (data descriptors), so `unzip` in `server/gtfs.ts` finds where each file ends by the next header and keeps only the seven files the timetable needs, 14 MB of the 48 (`shapes.txt` alone is 34 MB). A Durable Object has 128 MB, and reading the whole archive into memory first peaked near 200 MB. The trips are kept, with a week of service days, in `GTFS_FILE` (default `server/gtfs-timetable.json`, not committed) or, in the hub, in its storage (about 4 MB of JSON, in rows of 500 kB), so a restart does not download it again. Platforms map to stations by `stop_name`, since only metro trips are read, and to their Transport API site id through the game's network (`sl` on each station). GTFS numbers directions per route without saying which is which, so the direction whose trips end at the route's outbound terminal is 1, the game's track 1. While someone asks, it fetches TripUpdates at most every 15 s and answers `feeds/sl` with each station's departures for the next hour, checked against the Transport API on 24 September 2026: the same times, directions and `ATSTOP`.

**Keys.** A Trafiklab project (`under-stockholm`, Web project) has a GTFS Regional Realtime key and a GTFS Regional Static key, in `.env.local` locally as `TRAFIKLAB_RT_KEY` and `TRAFIKLAB_STATIC_KEY`, and as Worker secrets in production. Never in the client, never with a `VITE_` prefix. Quotas (all free, upgrade with "Upgrade quota" on the key):

| Level | Realtime | Static |
|---|---|---|
| Bronze (default) | 50/min, 30,000/month: one fetch every 90 s | 10/min, 50/month |
| Silver (approved September 2026, the level the `under-stockholm` key has now) | 250/min, 2,000,000/month: every 15 s | 10/min, 250/month |

**Feeds.**

- Realtime: `https://opendata.samtrafiken.se/gtfs-rt/sl/TripUpdates.pb?key=…`, about 300 kB gzip, about 1 MB decoded, updated every 15 s. A cron run every minute can fetch it up to four times, 15 s apart (Silver), or every other minute (Bronze).
- Static: `https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=…`, about 48 MB (`stop_times.txt` is about 140 MB unzipped). Fetched once a day (30 a month).
- Both answer `406` without `Accept-Encoding: gzip`, which Bun sends on its own and Cloudflare's runtime does not (`source` in `server/feedCore.ts` asks for it).

**What the data looks like** (checked 2026-09-24):

- Blue line routes: `9011001001000000` (10) and `9011001001100000` (11), `route_type` 401. `trip_headsign` is empty.
- Each station is a stop area; its platforms are `9022001` + the area number in six digits + a three digit platform (Kungsträdgården `9022001003031001` and `…002`). Areas: Kungsträdgården 3031, T-Centralen 1051, Rådhuset 3131, Fridhemsplan 1151, Stadshagen 3161, Västra skogen 3201, Solna centrum 3211, Näckrosen 3221, Hallonbergen 3231, Kista 3251, Husby 3261, Akalla 3271, Huvudsta 3411, Solna strand 3421, Sundbybergs centrum 3431, Duvbo 3441, Rissne 3451, Rinkeby 3461, Tensta 3471, Hjulsta 3481. The platforms' `stop_name` is the station's name, which is how the relay maps them. Line 11 trips also pass the timing points "Kymlinge norrut" and "Kymlinge söderut".
- TripUpdates carry no route id and no headsign, only `trip_id`, `stop_sequence`, `stop_id` and arrival/departure times for the stops still ahead.
- Only trips that have started are in the realtime feed. At T-Centralen it showed 2 of the 7 westbound departures of the next 30 minutes that the Transport API lists; eastbound matched to the minute.

**So realtime alone is not enough.** Combine it with the static timetable, the standard GTFS pattern (what `server/gtfs.ts` does):

1. Daily: download `sl.zip`, stream it, keep only metro trips from `trips.txt` (route, direction) and their rows in `stop_times.txt`, and store that timetable.
2. Every fetch of TripUpdates: take the metro trips by `trip_id`, override their scheduled times with the realtime ones, and keep the scheduled times for trips that have not started. Line and destination come from the static trip (destination = its last stop).
3. Write `feeds/sl` as before: per station, departures with line, destination, direction, journey id and expected time. `trip_id`s have 17 digits, more than a JavaScript number holds exactly, while the game keys journeys by number (`Sighting.journey` in `src/game/sl.ts`): send a short stable number per trip (for example an index in the day's timetable), not the raw id. The per-station budget then goes away.

## Cost

Cloudflare pricing (checked September 2026, see [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)):

| Durable Objects | Free | Paid ($5/month base) |
|---|---|---|
| Requests | 100,000/day | 1M/month included, then $0.15/M |
| Duration | 13,000 GB-s/day | 400,000 GB-s/month included, then $12.50/M GB-s |
| Incoming WebSocket messages | billed 20:1 | billed 20:1 |
| Outgoing WebSocket messages | free | free |

Other players at 2 positions a second cost about 360 requests per player-hour (7,200 messages at 20:1).

| Scenario | Free plan | Workers Paid |
|---|---|---|
| A few hundred player-hours a day | Everything works | $5/month |
| 10,000 players a day, 15 minutes each (2,500 player-hours) | Game and live data work; other players pause from about midday | About $5/month plus a few dollars |
| 5,000 at once | Same: others pause once the day's budget is spent | With shards (not built yet, section 3): about 25, about $0.40 an hour at that peak. Without, the first 200 see each other |
| 50,000 at once | Same | About 250 shards, about $4 an hour at that peak |

Quiet hours cost next to nothing on either plan. The game's files are free in every row. On the free plan a very busy day can also spend the Worker's own 100,000 requests (every feed poll and socket counts, section 3); Workers Paid includes 10 million a month.

## Alternatives

If Durable Objects stop fitting, the Bun relay runs as is on the options below. Put it behind the same domain as the game (a reverse proxy for `/ghosts`, `/feeds`, `/notes`, `/perf` and `/errors`), or build with `VITE_GHOSTS_URL=wss://<relay-host>/ghosts`.

- **Oracle Cloud Always Free** (ARM VM): truly free and generous, but you run the VM, TLS (Caddy) and systemd yourself, and outgoing traffic to tens of thousands of players adds up.
- **A small VPS** (5 to 20 euro a month): a fixed price, the same upkeep.
- **Your own machine with Cloudflare Tunnel**: free, but only up while the machine is.
