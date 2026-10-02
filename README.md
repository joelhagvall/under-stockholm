# Under Stockholm

**Stockholm's whole metro in your browser: walk the platforms, ride the trains, all 100 stations.**

<p align="center">
  <img src="docs/under-stockholm.webp" width="960" alt="A train pulls into T-Centralen under the blue vines, the carriage between stations, a red line train at Gamla stan in the open air, and the whole network as lines of light from above">
</p>

Every visitor shares the same timetable, and the trains can follow SL's live metro. Change lines at T-Centralen, feel Stockholm's real weather at the exits, find Kymlinge, or drive a C20 yourself. TypeScript, three.js and Rapier, no game engine.

A [Hägvall Labs](https://hagvall-labs.com/) game by [Joel Hägvall](https://joelhagvall.com/).

## Play

Play it at [understockholm.com](https://understockholm.com/), or run it yourself:

```bash
bun install
bun run dev
```

Open http://localhost:5180 and click **Gå ner i tunnelbanan** (or **English** at the top for English menus). The same page has three more ways in:

- **Se en tur** jumps through rush hour, snow, Lucia, 1975, Silverpilen and Kymlinge until you take over.
- **Se hela nätet** shows every line at its real depth under Stockholm, with every train as a point of light ([NETWORK.md](docs/NETWORK.md)).
- **Ett liv på blå linjen** is one ride from Kungsträdgården to Akalla where every station is a stretch of years, 1975 to 2050.

Phones work without a keyboard: thumbstick to walk, drag to look. Gamepads work too. Keys are in [GAMEPLAY.md](docs/GAMEPLAY.md).

Locally the trains follow SL's blue line out of the box. For all three lines, put a GTFS Regional Realtime and Static key from [Trafiklab](https://www.trafiklab.se/) in `.env.local` as `TRAFIKLAB_RT_KEY` and `TRAFIKLAB_STATIC_KEY`: the relay reads them, the browser never sees them. How it is hosted is in [DRIFT.md](docs/DRIFT.md).

## Nine things that matter

- **The whole metro.** All 100 stations on three lines and seven routes, the suburbs in the open air, plus Kymlinge, the station that never opened.
- **Real SL trains.** SL's live metro drives the game's trains: real destinations, real departures. Silverpilen, the silver ghost train, still slips in between.
- **Stockholm, right now.** Game time is Unix time, so every visitor sees the same trains, the real weather at the exits and the night shutdown.
- **A timetable, not a hope.** A train's position, speed and doors are a pure function of the clock, so trains cannot collide.
- **Drive it.** Press `K` for a C20 cab: master controller, ATC braking curve and a score for stopping at the board.
- **Places you were never meant to see.** Staff corridors, a shelter under Rådhuset, a time machine to 1975 and a book of what you have not found yet.
- **The network from above.** Every line as a glowing tube under a dark Stockholm, every train a light, any day's runs as a poster.
- **No engine hiding the work.** Procedural caves, canvas textures and baked light. three.js and Rapier load only when you enter.
- **The small stuff is the point.** Snus on a bench, a sneeze and a "prosit", bottle bags clinking on Fridays. More in [FEATURES.md](docs/FEATURES.md).

## Stack

- [Bun](https://bun.sh), [Vite](https://vite.dev), TypeScript
- [three.js](https://threejs.org) for rendering (WebGL)
- [Rapier](https://rapier.rs) (`@dimforge/rapier3d`) for physics
- No game engine. Geometry and textures are generated. Train sound, the announcement chime and the door warning are generated at runtime, and the browser's Swedish voice reads the announcements. A sneeze, a sigh and bottles clinking are public domain and CC0 recordings.

The simulation is split into small domain modules rather than one monolithic game loop. Time, routes, live SL, festivities, carriage life, disruptions, the emergency brake, discoveries, 1975 and other players each have their own module: `operations.ts`, `routes.ts`, `realService.ts`, `festivities.ts`, `carriageLife.ts`, `disruptions.ts`, `emergencyBrake.ts`, `discoveries.ts`, `era.ts`, `ghosts.ts`. The [full tree](docs/FEATURES.md#project-structure).

Station art is a generated interpretation, not a survey. See [DESIGN.md](docs/DESIGN.md).

## Development

| Script | What it does |
| --- | --- |
| `bun run dev` | Dev server with hot reload, plus the relay; both pick free ports |
| `bun run build` | Type-check and build to `dist/` |
| `bun run typecheck` | Type-check only |
| `bun run serve:prod` | Serve `dist/` with gzip on port 4173 (use this for audits) |
| `bun run ghosts` | Ghost relay and shared notes on their own, on a free port (or `PORT`) |
| `bun test` | Unit tests (Silverpilen, the power cut, the relay, i18n, the line map and more) |
| `bun run check` | The quality gate: types, tests, build budgets, leaks, frame rates, time to playing, Lighthouse and pa11y, against floors and the committed baseline, in levels (`--quick`, `--smoke`, `--perf`, `--web`, plus `--device` and `--accept`). `git push` runs the quick and smoke levels |
| `bun run release` | All of the gate, on its own |
| `bun run deploy` | The only way to go live, to understockholm.com: a clean, pushed tree, the whole gate, then the production build and the upload (`--dry-run` stops before it). `--landing` puts out the landing page alone, without the game |
| `bun run nightly` | All of the gate on what was pushed, in a worktree of its own; `--install` would run it every night on this Mac (off for now), `--trend` shows past nights |
| `bun run mem` | Leak check in headless Chrome: travel the network, a life and the cab, fail if anything is left behind (needs `bun run dev`) |
| `bun run fps` | Real frame rates in headless Chrome on this machine's GPU, as a desktop and as a phone; `--device` adds an Android phone over USB (needs `bun run dev`) |
| `bun run load` | Time from click to playing, desktop and slow 4G phone (needs `bun run serve:prod`) |

During ordinary edits, run `bun run typecheck` and the relevant test files with `bun test`. Before a push, use `bun run check --quick`, or `--smoke` for game changes; the push hook runs the needed level unless that exact tree has already passed. Use `--perf` for world, build-step or frame-loop changes and `--web` for landing page changes. `bun run check` with no flags and `bun run release` run the full gate, which also runs before every deploy.

GitHub's Quick job runs on pushes to main and pull requests; Web runs on relevant pushes to main. **Leaks (manual)** is an optional background check, started from Actions with **Run workflow**. Its first complete Linux CPU run took 43 minutes. Use it for Linux-specific leak investigations or when a full Linux check is requested, rather than waiting for it during ordinary edits or pushes. Local memory and performance checks use the GPU and give faster feedback.

The build fails if the landing page or the game grows past its compressed budget, and `bun run check` fails if it got slower than the numbers in `perf/baseline.json`. After launch, the relay's `/perf` page shows how the game runs for players: one anonymous report per visit (frame times, resolution, loading, class of device; no identifiers), and `/errors` what went wrong in their games.

`?debug` never pauses and exposes `window.__us`. `?natet` opens the network view, `?liv` a life on the blue line and `?debug&stromavbrott` a power cut a few seconds in. URL params for time, weather and Silverpilen, plus the relay and how to add a station, are in [FEATURES.md](docs/FEATURES.md#debug-and-the-relay).

## Roadmap

- The great departure: thousands of players on the same platform on New Year's Eve
- The extension: Barkarby and Nacka under construction at the ends of the blue line
- 2050: the other direction of the time machine, driverless trains behind glass doors
- Curved tunnels in the game (the network view has them)
- More exits, and more of the city up on the street

The rest of the ideas are in [IDEAS.md](docs/IDEAS.md).

## Data and credits

Live data reaches the game only through the relay (a Cloudflare Worker in production, [DRIFT.md](docs/DRIFT.md)), which asks each source once per interval for every player. Browsers never call them.

| Source | Used for | Licence |
| --- | --- | --- |
| [SL](https://www.trafiklab.se/api/our-apis/sl/) via Trafiklab: Transport and Deviations | Live departures, disruptions, broken escalators | SL's open data terms |
| [Trafiklab GTFS Regional](https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/), Samtrafiken | Live trains on all three lines | CC0 1.0 |
| [Open-Meteo](https://open-meteo.com/) | The weather at the exits | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [SMHI](https://www.smhi.se/) | Weather warnings for Stockholm County | SMHI's open data terms, source named in the game |
| [Sveriges Radio](https://www.sverigesradio.se/), P4 Stockholm | Headlines in the game's newspapers | [SR's API terms](https://www.sverigesradio.se/artikel/api-villkor) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors | Buildings round the open-air stations, streets out of the exits, the city in the network view | [ODbL](https://opendatacommons.org/licenses/odbl/) |
| [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/) | The ground's heights in the network view | © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, all rights reserved |
| Albert Guillaumes' [station plans](http://stations.albertguillaumes.cat/) | Where each station's halls, inclined lifts and long passages lie | Reference only, no drawings in the repository |
| Wikimedia Commons and Freesound | A sneeze, a sigh and bottles clinking | Public domain and CC0 ([sources](public/audio/sfx/README.md)) |

The map data lives in `src/game/world/osm/`, `src/network/city/` and `src/network/terrain.json`, fetched by `scripts/osm.ts`, `scripts/osm-streets.ts`, `scripts/osm-city.ts` and `scripts/terrain.ts`. Built with [three.js](https://threejs.org) (MIT) and [Rapier](https://rapier.rs) (Apache 2.0).

## Disclaimer

A fan project. Not affiliated with or endorsed by SL, Region Stockholm, Sveriges Radio or SMHI.

## License

The code is MIT ([LICENSE](LICENSE)). It covers this project's own work, not SL's or Region Stockholm's names and marks, nor the data above, which keeps its own licence. The recorded C20 announcements are not part of the repository ([why](public/audio/README.md)).
