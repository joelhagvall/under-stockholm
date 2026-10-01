// The launch video (video/under-stockholm-launch.mp4, not committed): 30 seconds, 4:5 at 1080x1350 for a phone's
// feed (LinkedIn), cut to the music's bars. A train into T-Centralen under the hook from the first frame, a glimpse of
// the ride aboard, a station on each beat, a run from the ticket hall up the stairs onto the street on an autumn
// evening, the cab out onto the viaduct at Kista, the power cut, a day on the whole network with every train a light
// running round it, a click on Stadion that dives down into it, and the title with the address. Captions in Swedish, like the launch post
// (LAUNCH.md). Filmed and scored in the page through `capture.ts` and `music.ts`.
// Needs `bun run dev` running and ffmpeg. Options: --url http://localhost:5180/ (default), --wide (16:9 at 1080p, to
// video/under-stockholm-launch-wide.mp4), --out <file> (another file than the default), --stills (one frame per
// scene, to set up the shots), --scene <part of a name>.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mp4, shoot, type Scene } from './capture';
import { renderMusic, type Score } from './music';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const STILLS = process.argv.includes('--stills');
const WIDE = process.argv.includes('--wide');
const FPS = 30;
const OUT = arg('out', join(import.meta.dir, '..', 'video', `under-stockholm-launch${WIDE ? '-wide' : ''}.mp4`));
const FRAMES = join(tmpdir(), 'launch-video-frames');
/** Every cut falls on a bar: 100 beats a minute, four to the bar. */
const BPM = 100;
const BAR = (60 / BPM) * 4;
/** Where the camera stands from T-Centralen in the close look under the city, in the network view's units (100 m). */
const UNDER = { x: 4.5, y: 3.8, z: 6.8 };

/**
 * The montage's stations, one on each beat of two bars, which way each looks off the platform's length, and how far
 * along x from where one arrives the camera stands (at Skarpnäck a passenger walks through the arrival spot).
 */
const MONTAGE: Array<[string, 1 | -1, number?]> = [
  ['Solna centrum', 1], ['Hallonbergen', -1], ['Kungsträdgården', -1], ['Solna strand', 1],
  ['Skarpnäck', 1, 8], ['Tekniska högskolan', -1], ['Fridhemsplan', 1], ['Globen', -1],
];

const SCENES: Scene[] = [
  {
    // Under the blue vines as a train comes in, with the hook already up on the first frame: it is the thumbnail,
    // and a feed plays it without sound.
    name: 'T-Centralen',
    view: 'game',
    // In the opening of the wall down the island, looking out over the track under the vines.
    place: `{ const s = __us.world.stations[1]; __stand(s.cx + 12, 1.1, -0.5, Math.PI / 2 - 0.4, 0.15); }`,
    start: `__before(1, 1, 9);`,
    each: `__us.player.yaw -= 0.0006;`,
    seconds: 1.5 * BAR,
    speed: 1.4,
    caption: ['Hela tunnelbanan i webbläsaren', '100 stationer, tre linjer, ingen nedladdning'],
    captionAt: -0.5,
  },
  {
    // Close over T-Centralen in the whole network: the trains running in their tunnels under the see-through city, the
    // cut through the ground showing the tubes.
    name: 'Under the city',
    view: 'network',
    place: `{
      // The view's day, run here at about eight times life (see \`speed\`), from now: the live view keeps to the wall clock,
      // where the frames, filmed slower than life, would leave the trains standing. Their trails left out: run as a day
      // they reach far back.
      const day = document.querySelector('.net-day'); if (day.getAttribute('aria-pressed') !== 'true') day.click();
      for (const o of __net.trains.parent.children) if (o.isLineSegments && o.material.vertexColors && o.material.blending === 2) o.visible = false;
      const p = __net.station('T-Centralen');
      // Looking a little to the left of it, so the junction stands right of the caption.
      __net.controls.target.copy(p).add(p.clone().set(-1.6, 0.8, 0.6));
      __net.camera.position.copy(__net.controls.target).add(p.clone().set(${UNDER.x}, ${UNDER.y}, ${UNDER.z}));
      __net.controls.update();
    }`,
    // A second of frames first, so the heights' stretch and the tubes settle at this distance: the frames filmed after
    // run too little time for them to.
    start: `__net.step(1, 30);`,
    // Panning slowly along, at the same distance, while the trains run through under the houses.
    each: `{ const d = 0.012; __net.controls.target.x += d; __net.camera.position.x += d; }`,
    seconds: BAR,
    // The day runs 1440 times faster than the clock: this is about eight times life.
    speed: 0.006,
    caption: ['Under den riktiga staden', 'Varje tåg i sin tunnel, just nu'],
    captionAt: 0.15,
  },
  {
    // Aboard, as the train rolls on to the next station.
    name: 'Aboard',
    view: 'game',
    place: `__us.goto(1)`,
    // Aboard, standing in the aisle just behind a gangway, looking down the cars the way the train runs.
    start: `{
      __us.ride(); __us.step(3, 15);
      const f = __us.player.feet, d = (s) => Math.hypot(s.train.position.x - f.x, s.train.position.z - f.z);
      const v = __us.services.filter((s) => s.active).sort((a, b) => d(a) - d(b))[0], st = v.timetable.stateAt(v.clock);
      const ahead = v.timetable.stops[st.phase === 'moving' ? st.next : st.stop].track === 1 ? 1 : -1;
      const t = v.train.position;
      __stand(t.x - ahead * 10, 1.1, t.z + 0.15, ahead > 0 ? -Math.PI / 2 : Math.PI / 2, -0.03);
    }`,
    seconds: BAR / 2,
    speed: 1,
    caption: ['Kliv på', 'Nästa station ropas ut ombord'],
    captionAt: -0.5,
  },
  // A station on each beat, across the three lines, from red to white, green, black, brick and pale, and out into
  // the daylight.
  ...MONTAGE.map(([name, side, along = 0], k): Scene => ({
    name: `Montage ${name}`,
    view: 'game',
    // Turned a little off the platform's length, toward the vault and the walls.
    place: `{
      __us.goto(__station(${JSON.stringify(name)}));
      const p = __us.player, yaw = p.yaw;
      p.teleport(p.feet.clone().setX(p.feet.x + ${along}), yaw + ${0.5 * side});
      p.pitch = 0.14;
      __us.world.ensureBuilt(p.feet.x);
    }`,
    each: `__us.player.yaw -= ${0.0025 * side};`,
    seconds: BAR / 4,
    caption: ['Varje station sin egen', 'Konsten, berget och kaklet från de riktiga'],
    // In over the first cut, then held over the rest.
    captionAt: k ? -1 : 0,
  })),
  {
    // From Odenplan's ticket hall up its stairs toward the sky over the open top, and out among the real city round the
    // exit (OpenStreetMap's houses and streets) on an overcast autumn evening, as the launch day's weather was, turning
    // to look along the street. After half past nine, when the pigeons that scatter up the stairs have gone.
    name: 'Street',
    view: 'game',
    // Up on the street first, so the city round the exit is built before the walk.
    place: `__clock(21, 40); __us.setWeather('cloudy'); __us.goto(__station('Odenplan')); __us.step(2, 15); __us.street('Odenplan');`,
    // Along the hall from its wall (`a`, see `HALL_LEN` and `STREET` in layout.ts): level to the stairs at 19, up to the
    // landing at 26, on under the sky from 23, up the second flight in its open cut from 32 to 42.5, and the street.
    each: `{
      const h = __us.world.stations[__station('Odenplan')].halls[0], Y = h.bounds.y, T = f / ${FPS};
      const k = Math.min(1, T / 4), e = k * k * (3 - 2 * k), a = 16 + 31 * e;
      const lerp = (a0, a1, y0, y1) => y0 + (y1 - y0) * Math.min(1, Math.max(0, (a - a0) / (a1 - a0)));
      const y = a < 26 ? lerp(19, 26, Y, Y + 3.4) : lerp(32, 42.5, Y + 3.4, Y + 8.5);
      const turn = Math.max(0, (T - 3.2) / 1.6), out = h.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      __us.player.teleport(__us.player.feet.clone().set(h.x(a), y + 0.05, 0), out + 0.9 * turn * turn * (3 - 2 * turn));
      __us.player.pitch = a < 42 ? 0.22 : 0.22 - 0.16 * Math.min(1, (a - 42) / 4);
    }`,
    seconds: 2 * BAR,
    caption: ['Upp på gatan', 'Varje uppgång leder ut i riktiga kvarter, i vädret just nu'],
    captionAt: 0.6,
  },
  {
    // In the cab at speed in the tunnel past Kymlinge, and out of it into Kista up on its viaduct in daylight.
    name: 'Cab',
    view: 'game',
    // Placed once: `place` runs again before filming, and a second trip to Hallonbergen would leave the world shown
    // round the platform there, far behind the cab.
    place: `__clock(13, 0); __us.setWeather('clear'); if (!__us.player.driveEye) { __us.goto(__station('Hallonbergen')); __us.drive(); }`,
    // Driven there a quarter second at a time, then what lies round the cab and Kista built, and drawn once, before the
    // first frame.
    start: `{ const k = __us.world.stationX[__station('Kista')]; __us.driver.throttle(4); for (let n = 0; n < 600 && __us.driver.train.position.x < k - 200; n++) __us.step(0.25, 15); __us.world.ensureBuilt(__us.player.feet.x); __us.world.ensureBuilt(k); __us.step(0.1, 30); }`,
    seconds: BAR,
    speed: 2,
    caption: ['Kör själv', 'ATC, bromskurva och poäng för stoppet'],
    captionAt: 0.15,
  },
  {
    // The power cut on T-Centralen's platform: the tubes die and the phone torches come out.
    name: 'Power cut',
    view: 'game',
    place: `__us.stopDriving(); { const s = __us.world.stations[1]; __stand(s.cx - 12, 1.1, 0.5, -Math.PI / 2 - 0.4, 0.15); }`,
    start: `__us.powerCut(0.3, 90);`,
    each: `__us.player.yaw += 0.001;`,
    seconds: BAR,
    speed: 1,
    caption: ['Och ibland går strömmen'],
    captionAt: 0.5,
  },
  {
    // Every line at its real depth, a day running past, as the camera circles.
    name: 'The whole network',
    view: 'network',
    // The trains' lights larger than in the view, so one sees them run along the lines: held at `__trainSize` while it
    // is set, as the view sets their size again whenever the camera moves.
    place: `{
      document.querySelector('.net-day').click(); __net.camera.position.set(-10 + 22, 62, 88);
      const m = __net.trains.material;
      if (!m.__held) { let own = m.size; Object.defineProperty(m, 'size', { get: () => window.__trainSize ?? own, set: (v) => { own = v; }, configurable: true }); m.__held = true; }
      window.__trainSize = 11;
      // Their trails and cars left out: a day this fast draws them as long streaks across the city.
      for (const o of __net.trains.parent.children) if ((o.isLineSegments && o.material.vertexColors && o.material.blending === 2) || (o.isInstancedMesh && Array.isArray(o.material))) o.visible = false;
    }`,
    each: `{ const c = __net.camera.position, a = 0.004, x = c.x + 10; c.x = x * Math.cos(a) - c.z * Math.sin(a) - 10; c.z = x * Math.sin(a) + c.z * Math.cos(a); c.y -= 0.12; }`,
    seconds: BAR,
    // The view's day runs 1440 times faster than the clock: slower here, or the trains jump between frames and flicker.
    speed: 0.3,
    caption: ['Ett dygn på en minut', 'Varje tåg under staden'],
    captionAt: 0.15,
  },
  {
    // Back to now, and a click on Stadion: the camera dives down to it.
    name: 'Dive',
    view: 'network',
    place: `{
      const day = document.querySelector('.net-day'); if (day.getAttribute('aria-pressed') === 'true') day.click();
      for (const o of __net.trains.parent.children) if ((o.isLineSegments && o.material.vertexColors) || (o.isInstancedMesh && Array.isArray(o.material))) o.visible = true;
    }`,
    each: `{
      const T = f / ${FPS}, p = __net.where('Stadion'), c = document.querySelector('.net canvas');
      const k = Math.min(1, Math.max(0, T / 0.7)), e = k * k * (3 - 2 * k);
      const x = p.x + 160 * (1 - e), y = p.y + 100 * (1 - e);
      const at = { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true, isPrimary: true };
      if (T < 0.9) c.dispatchEvent(new PointerEvent('pointermove', at));
      // Large until the click; down by the station the view's own size, or they would be blots.
      window.__trainSize = T < 0.9 ? 11 : null;
      if (f === Math.round(0.9 * ${FPS})) { c.dispatchEvent(new PointerEvent('pointerdown', at)); c.dispatchEvent(new PointerEvent('pointerup', at)); }
      window.__pointer = T < 1.3 ? { x: x * 2, y: y * 2, label: e > 0.85 ? 'Stadion' : null, press: T > 0.9 && T < 1.05 } : null;
    }`,
    seconds: BAR,
    // The dive after the click runs quicker than life, so it goes down in the second left of the bar.
    speed: 1.8,
    fadeOut: 0.4,
    caption: ['Hela nätet, just nu', 'Klicka på en station och gå ner'],
    captionAt: 0,
  },
  {
    // Where the dive lands: Stadion's rainbow arching over the vault, as a train comes in under it.
    name: 'Stadion',
    view: 'game',
    // Turned from the bench beside, where a man flickered between sitting and standing.
    place: `{ const s = __us.world.stations[__station('Stadion')]; __stand(s.cx - 14, 1.1, 2.4, -Math.PI / 2 - 0.6, 0.25); }`,
    start: `__before(__station('Stadion'), 2, 5.5);`,
    seconds: BAR,
    speed: 1.3,
    fadeIn: 0.5,
  },
  {
    name: 'Title',
    view: 'card',
    seconds: 1.5 * BAR,
    fadeOut: 1.6,
    caption: ['Under Stockholm', 'Spela gratis på understockholm.com'],
    captionAt: 0.2,
  },
];

// The music follows the film: the tunnel with the chords and the rail joints, the arpeggio and a kick on each cut of
// the montage, the drums up the stairs and in the cab, almost nothing in the dark, the drums again round the network, a
// rise through the dive, and the last chord ringing under the title.
const full = { pad: 1, bass: 1, arp: 1, kick: 1, hat: 0.8, rail: 0.5 };
// No recorded announcement goes in: the C20 voice is not ours to publish.
const score: Score = {
  bpm: BPM,
  bars: [
    { pad: 0.8, rail: 0.4 },
    { pad: 1, rail: 0.6, bell: 0.8 },
    { pad: 1, bass: 0.8, arp: 0.8, kick: 1, rail: 0.6 },
    { pad: 1, bass: 0.8, arp: 0.8, kick: 1, riser: 0.6 },
    full,
    { ...full, bell: 0.6 },
    { ...full, riser: 0.5 },
    { pad: 0.6, riser: 1 },
    { ...full, bell: 0.8 },
    { pad: 1, bass: 0.8, arp: 0.8, riser: 1 },
    { ...full, bell: 0.8 },
    { pad: 1, bell: 1, ring: true },
    {},
  ],
  seconds: SCENES.reduce((sum, s) => sum + s.seconds, 0),
  fade: 2,
};

const film = { fps: FPS, speed: 1, width: WIDE ? 960 : 540, height: WIDE ? 540 : 675, dir: FRAMES, stills: STILLS, only: arg('scene', ''), url: arg('url', 'http://localhost:5180/') };
const { browser, page } = await shoot(SCENES, film);
try {
  if (!STILLS) {
    await page.goto(film.url);
    await Bun.write(join(FRAMES, 'music.wav'), await renderMusic(page, score));
  }
} finally {
  await browser.close();
}
if (STILLS) console.log(`Stills in ${FRAMES}`);
else mp4(FRAMES, FPS, OUT, join(FRAMES, 'music.wav'), WIDE ? 1920 : 1080);
