// The launch video (video/under-stockholm-launch.mp4, not committed): 41 seconds, 4:5 at 1080x1350 for a phone's
// feed (LinkedIn), cut to the music's bars. A train into T-Centralen under the hook from the first frame, the real
// ride aboard, Gamla stan in the open, rush hour and the sigh behind you on the escalator, then a quick run up onto the
// street in the snow, the cab out onto the viaduct at Kista, 1975 and Kymlinge, the power cut, a day on the whole
// network, a click on Stadion that dives down into it, and the title with the address. Captions in Swedish, like the launch post (LAUNCH.md). Filmed
// and scored in the page through `capture.ts` and `music.ts`.
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
    seconds: 2 * BAR,
    speed: 1.4,
    caption: ['Hela tunnelbanan i webbläsaren', '100 stationer, tre linjer, ingen nedladdning'],
    captionAt: -0.5,
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
    seconds: 2 * BAR,
    speed: 1,
    caption: ['Kliv på', 'Nästa station ropas ut ombord'],
    captionAt: 0.6,
  },
  {
    // Out in the open at Gamla stan, as a red line train comes in off the bridge.
    name: 'Gamla stan',
    view: 'game',
    place: `{ const s = __us.world.stations[31]; __stand(s.cx - 68, 1.1, -9.3, -Math.PI / 2 - 0.2); }`,
    // A red line train in off the bridge: the next on the green line's track beside would come in out of shot.
    start: `__before(31, 1, 7, 1);`,
    seconds: BAR,
    speed: 1.3,
    caption: ['Ut i dagsljuset', 'Över Riddarfjärden och ut i förorterna'],
  },
  {
    // The City passage at eight in the morning.
    name: 'Rush hour',
    view: 'game',
    place: `__clock(8, 10); __us.city();`,
    each: `__us.player.yaw += 0.0016;`,
    seconds: BAR,
    speed: 1.2,
    caption: ['Rusning klockan åtta', 'Alla ser samma tåg, på riktig tid'],
    captionAt: 0.15,
  },
  {
    // Standing still on the left of T-Centralen's escalator at rush hour, riding up and looking up the flight the way it
    // goes (looking back down at the one stuck behind read as riding down).
    name: 'Escalator',
    view: 'game',
    place: `{
      const e = __us.world.stations[1].escalators[0], lane = e.stoppedLane === 1 ? -1 : 1, along = lane > 0 ? 3 : 20;
      const y = 1.1 + Math.min(e.rise, Math.max(0, (along - 1.25) * Math.tan(Math.PI / 6)));
      __stand(e.wallX + e.dir * along, y + 0.05, e.z + lane * 1.18 - 0.28 * e.dir * lane, -e.dir * lane * Math.PI / 2, 0.3 * lane);
    }`,
    // Ride a while first, so a walker has caught up and stands stuck on the step behind.
    start: `__us.step(10, 15);`,
    seconds: BAR,
    caption: ['Stå till höger', 'Annars suckar någon bakom dig'],
    captionAt: 0.15,
  },
  {
    // Up out of the exit among the real city round it (OpenStreetMap's houses and streets), as the snow comes down on
    // a winter evening.
    name: 'Street',
    view: 'game',
    place: `__clock(17, 40); __us.setWeather('snow'); __us.goto(__station('Odenplan')); __us.step(2, 15); __us.street('Odenplan'); __us.player.pitch = 0.08;`,
    each: `__us.player.yaw += 0.0015;`,
    seconds: BAR,
    caption: ['Upp på gatan', 'Riktiga kvarter runt varje uppgång, i vädret just nu'],
    captionAt: 0.15,
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
    // Rådhuset in 1975, as a train comes in.
    name: '1975',
    view: 'game',
    place: `__us.stopDriving(); __us.era.set('1975', false); { const s = __us.world.stations[2]; __stand(s.cx - 12, 1.1, 0.5, -Math.PI / 2 - 0.4, 0.15); }`,
    start: `__before(2, 2, 4);`,
    seconds: BAR,
    caption: ['Åk tillbaka till 1975'],
    captionAt: 0.15,
  },
  {
    // The station that never opened.
    name: 'Kymlinge',
    view: 'game',
    place: `__us.era.set('now', false); __us.kymlinge(); __us.player.pitch = 0.04;`,
    each: `__us.player.yaw += 0.002;`,
    seconds: BAR,
    caption: ['Hitta Kymlinge', 'Stationen som aldrig öppnade'],
    captionAt: 0.15,
  },
  {
    // The power cut on T-Centralen's platform: the tubes die and the phone torches come out.
    name: 'Power cut',
    view: 'game',
    place: `{ const s = __us.world.stations[1]; __stand(s.cx - 12, 1.1, 0.5, -Math.PI / 2 - 0.4, 0.15); }`,
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
    place: `document.querySelector('.net-day').click(); __net.camera.position.set(-10 + 22, 62, 88);`,
    // The trains' lights a little larger than in the view, so one sees them run along the lines.
    each: `{ const c = __net.camera.position, a = 0.004, x = c.x + 10; c.x = x * Math.cos(a) - c.z * Math.sin(a) - 10; c.z = x * Math.sin(a) + c.z * Math.cos(a); c.y -= 0.12; __net.trains.material.size = 11; }`,
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
    place: `{ const day = document.querySelector('.net-day'); if (day.getAttribute('aria-pressed') === 'true') day.click(); }`,
    each: `{
      const T = f / ${FPS}, p = __net.where('Stadion'), c = document.querySelector('.net canvas');
      const k = Math.min(1, Math.max(0, T / 0.7)), e = k * k * (3 - 2 * k);
      const x = p.x + 160 * (1 - e), y = p.y + 100 * (1 - e);
      const at = { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true, isPrimary: true };
      if (T < 0.9) c.dispatchEvent(new PointerEvent('pointermove', at));
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
    place: `{ const s = __us.world.stations[__station('Stadion')]; __stand(s.cx - 14, 1.1, 2.4, -Math.PI / 2 - 0.35, 0.25); }`,
    start: `__before(__station('Stadion'), 2, 5.5);`,
    seconds: BAR,
    speed: 1.3,
    fadeIn: 0.5,
  },
  {
    name: 'Title',
    view: 'card',
    seconds: 2 * BAR,
    fadeOut: 1.6,
    caption: ['Under Stockholm', 'Spela gratis på understockholm.com'],
    captionAt: 0.2,
  },
];

// The music follows the film: the tunnel and the ride with the chords and the rail joints, the arpeggio in the open
// air, the drums from rush hour through the quick cuts, almost nothing in the dark, a rise into the network, another
// through the dive, and the last chord ringing under the title.
const full = { pad: 1, bass: 1, arp: 1, kick: 1, hat: 0.8, rail: 0.5 };
// No recorded announcement goes in: the C20 voice is not ours to publish.
const score: Score = {
  bpm: BPM,
  bars: [
    { pad: 0.8, rail: 0.4 },
    { pad: 1, rail: 0.6, bell: 0.8 },
    { pad: 1, bass: 0.6, rail: 0.6 },
    { pad: 1, bass: 0.6, rail: 0.6, bell: 0.5 },
    { pad: 1, bass: 0.8, arp: 0.8, rail: 0.7, riser: 0.6 },
    full,
    { ...full, bell: 0.6 },
    full,
    { ...full, bell: 0.6 },
    full,
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
