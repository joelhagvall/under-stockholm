import './gfx/roundRect';
import { usesTouchControls } from '../device';
import { chosenLang, saveLang } from '../lang';
import { TouchControls } from './touchControls';
import { AdditiveBlending, Color, Fog, HemisphereLight, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer, WebGLRenderTarget, type BufferGeometry, type Object3D } from 'three';
import { Audio } from './audio';
import { announcementAt, AnnouncementTracker } from './announcements';
import { RECORDED_ANNOUNCEMENTS, STATION_RECORDINGS } from './announcementSignal';
import { Ambience, type AmbientTrain } from './ambience';
import { Busker } from './busker';
import { Saxophonist } from './saxophone';
import { CabinLife } from './cabin';
import { escalatorOutOfOrder, isCold, occasion, summerHeat } from './calendar';
import { busyness, formatClock, season, serviceOpen, stockholm, stockholmEpoch, summerTimetable } from './clock';
import { Driver } from './driver';
import { Effects, type EffectTrain } from './effects';
import { Festivities } from './festivities';
import { Critters } from './critters';
import { BAG_SIZE, LOST_KINDS, LostProperty } from './lostProperty';
import { Bag, renderIcons } from './bag';
import { propMaterial } from './props';
import { PlatformLife } from './platformLife';
import { RegularLife } from './regularLife';
import { LIFE_AFTER, LIFE_BEFORE, LifeCompany, lifeScenes, type LifeScene } from './life';
import { Coffee } from './coffee';
import { Footsteps, type Surface } from './footsteps';
import { RideLight } from './rideLight';
import { CarriageLife } from './carriageLife';
import { Signals } from './signals';
import { Express, type ExpressState } from './express';
import { TrackWork } from './trackWork';
import { BrakeOverride } from './emergencyBrake';
import { BeltRiders } from './belts';
import { Exploration } from './explore';
import { staffKey } from './staffKey';
import { artWalk } from './artWalk';
import { noteWriter, sharedNotes } from './notes';
import { Music, Screensaver } from './screensaver';
import { dateAt, daytime, type ShowPose, type ShowScene, Showcase, silverStop, weekdayAt } from './showcase';
import { luciaPose } from './festivities';
import { CLUES, mystery } from './mystery';
import { DISCOVERIES, DiscoveryBook, GROUPS } from './discoveries';
import { era, type Era } from './era';
import { Preacher } from './preacher';
import type { Seat } from './journey';
import { EscalatorLife } from './escalatorLife';
import { Fares, type FareService } from './fares';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { Ghosts, ghostUrl, type GhostPose } from './ghosts';
import { relayUrl } from './relay';
import { gpuName, Telemetry } from './telemetry';
import { crashFacts, FEEDBACK_MAIL, reportError, watchErrors } from './crash';
import { HallLife } from './hallLife';
import { RushHour } from './rush';
import { Hud } from './hud';
import { planTrip, TripGuide, tripSummary, waitText, type Leg, type TripView, type Wait } from './trip';
import { cabinSeats, nearestSeat } from './journey';
import { Crowd, occupiedSeatPoses, trainPassengerPoses } from './crowd';
import { inLanguage, lang, setLang, text } from './i18n/text';
import { DOOR_HALF_W, HALL_HALF_W, PLATFORM_HALF_L, PLATFORM_HALF_W, PLATFORM_Y, TRACK_Z, TRAIN_HALF_L, TRAIN_HALF_W, trackSide, UNDERPASS_DEPTH } from './layout';
import { isLineTerminal, NETWORK, networkServices, networkSlots, ridership, serviceDestination, stationIndex as indexOf } from './line';
import { Night, stationLight } from './night';
import { Operations, startTime } from './operations';
import { loadRapier, Physics, type Rapier } from './physics';
import { Player } from './player';
import { RealTrains } from './realService';
import { realTrainsAvailable, type Journey } from './sl';
import { noiseBurst, placeListener, thump, tone } from './sfx';
import { Silverpilen, type SilverState } from './silverpilen';
import { RealSilverpilen, type Rival } from './silverReal';
import { Timetable, type TrainState } from './timetable';
import { setWindowFog, Train } from './train';
import { loadTrainModel } from './trainModel';
import { OpenAirWeather, Weather, type WeatherKind } from './weather';
import { Disruptions, forStation } from './disruptions';
import { Warnings } from './warnings';
import { Wind, type WindTrain } from './wind';
import { AdaptiveResolution, RENDER_SCALES } from './resolution';
import { World } from './world/world';
import { underHall, type DepartureRow } from './world/station';
import { Sky, SKY_RADIUS } from './world/sky';
import { setDaylight } from './world/section';
import { LOADING_SLICE_MS, nextFrame } from './frames';
import { keyName, rebindPrompt, rebindText, settings } from './settings';
import { SettingsPanel } from './settingsPanel';
import { Gamepads } from './gamepad';
import { FirstSteps } from './firstSteps';
import { comeBack, savedPlace, savePlace } from '../place';
import { cutClock, cutRate, forceCut, powerOut } from './powerCut';
import { PowerLights, type Torch } from './powerLights';

const FOG = 0x050608;
/** Silverpilen's index for other players, past every regular train. */
const SILVER_INDEX = 255;
/** Trains each line can run for SL's real journeys: the timetable's own, then spares. At SL's busiest the lines run about 18, 40 and 57 trains at once. */
const REAL_SLOTS = [14, 44, 60];
/** Larger clock differences jump instead of slewing. */
const CLOCK_JUMP = 20;
/** Below this the player has fallen out of the world: a few meters under the lowest floor, a hall under the tracks. */
const FALL_Y = PLATFORM_Y - UNDERPASS_DEPTH - 3;
/** The most frames drawn a second, and in battery saver. */
const FPS_MOST = 60;
const FPS_BATTERY = 30;
/** How early a screen's tick may come and still count as a whole frame (a 60 Hz screen's ticks wander by a millisecond or two). */
const FRAME_SLACK_MS = 2.5;
/** How long a lost WebGL context is waited for before the page comes back without it, in ms. */
const CONTEXT_WAIT = 4000;
/** A context lost this soon after the tab is shown again was lost while it was hidden (ms). */
const CONTEXT_AWAY = 10_000;
/** How far off a train's inside is still drawn (see `Train.setInteriorShown`): about as far as its passengers show. */
const INTERIOR_REACH = 230;
/** Trains each track's rows on the platform boards list, as SL's do. */
const BOARD_ROWS = 2;
/** How long the first minute waits for SL's trains before starting without a seat, in ms. */
const STAGE_WAIT = 4000;

interface Service {
  index: number;
  train: Train;
  /** The route this train follows now. */
  timetable: Timetable;
  offset: number;
  /** Timetable clock this train follows: `time + offset`, or a real journey's warped clock. */
  clock: number;
  /** Timetable seconds per game second (below 1 when a real train runs slower than the timetable). */
  rate: number;
  /** Index of the route (among all the network's) for destinations. */
  route: number;
  /** The line it runs on. */
  line: number;
  /** The SL journey driving this train in real mode. */
  journey: Journey | null;
  state: TrainState | null;
  active: boolean;
  /** Seconds this train runs behind the timetable, after someone pulled its emergency brake. */
  delay: number;
  /** While the emergency brake has it, the train follows this instead of the timetable. */
  brake: BrakeOverride | null;
  /** Its place among its line's trains, which is its slot for real journeys. */
  slot: number;
}

const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

interface SpectorCapture { commands: Array<{ name: string; commandArguments: ArrayLike<unknown>; [key: string]: unknown }> }
interface SpectorLike { onCapture: { add(cb: (c: SpectorCapture) => void): void }; captureCanvas(canvas: HTMLCanvasElement, commands?: number, quick?: boolean): void }

/** A SpectorJS capture in numbers: draws per program, the biggest draws and how often state changes. */
function summarizeCapture(capture: SpectorCapture) {
  const names = new Map<string, number>();
  const perProgram = new Map<number, { draws: number; vertices: number }>();
  const draws: Array<{ id: number; vertices: number; program: number }> = [];
  let program = -1;
  let programs = 0;
  for (const c of capture.commands) {
    names.set(c.name, (names.get(c.name) ?? 0) + 1);
    if (c.name === 'useProgram') { program = programs++; continue; }
    if (!c.name.startsWith('draw')) continue;
    const a = c.commandArguments;
    const count = Number(c.name.startsWith('drawArrays') ? a[2] : a[1]) * (c.name.endsWith('Instanced') ? Number(a[c.name.startsWith('drawArrays') ? 3 : 4]) : 1);
    const p = perProgram.get(program) ?? { draws: 0, vertices: 0 };
    p.draws++;
    p.vertices += count;
    perProgram.set(program, p);
    draws.push({ id: draws.length, vertices: count, program });
  }
  return {
    commands: capture.commands.length,
    draws: draws.length,
    programSwitches: programs,
    calls: Object.fromEntries([...names].sort((a, b) => b[1] - a[1]).slice(0, 12)),
    biggest: draws.sort((a, b) => b.vertices - a.vertices).slice(0, 10),
    byProgram: [...perProgram].sort((a, b) => b[1].vertices - a[1].vertices).slice(0, 10).map(([p, v]) => ({ program: p, ...v })),
  };
}

export interface GameOptions {
  /** Open with the showcase tour instead of on a platform. */
  showcase?: boolean;
  /** Physics can download while the game module itself is still loading. */
  physicsReady?: Promise<Rapier>;
  /** Start where the player last stood instead of aboard an arriving train. */
  resume?: boolean;
  /** A station picked in the network view: start aboard a train pulling in there, or on its platform. */
  station?: string;
  /** A trip picked in the network view: start on its first platform, guided from there (`trip.ts`). */
  trip?: { from: string; to: string };
  /** Start with a life on the blue line (`life.ts`). */
  life?: boolean;
  /** When the player clicked to start, `performance.now()`, so the time to playing counts the download too. */
  since?: number;
}

export async function startGame(root: HTMLElement, options: GameOptions = {}): Promise<void> {
  const touchMode = usesTouchControls();
  // Menus, help and settings in the player's language; the world stays Swedish.
  setLang(chosenLang());
  root.classList.toggle('is-touch', touchMode);
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  const loadMark = (part: string) => { if (debug) performance.mark(`us-load:${part}`); };
  loadMark('boot');
  watchErrors();
  const freezeTimetable = debug && params.has('freeze');
  // The layout and starting view are built in slices, so the page answers while the rock is blasted.
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.setAttribute('role', 'progressbar');
  loading.setAttribute('aria-valuemin', '0');
  loading.setAttribute('aria-valuemax', '100');
  loading.setAttribute('aria-label', text.loading.title);
  loading.innerHTML = `<div class="loading-card"><p class="loading-title">${text.loading.title}</p><div class="loading-bar"><div class="loading-fill"></div></div><p class="loading-note">${text.loading.note}</p></div>`;
  root.appendChild(loading);
  const loadingFill = loading.querySelector<HTMLElement>('.loading-fill')!;
  // Reserve progress for physics, the world, trains, scene setup and the first render.
  const loadStart = performance.now();
  const setProgress = (fraction: number) => {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    loadingFill.style.transform = `scaleX(${pct / 100})`;
    loading.setAttribute('aria-valuenow', String(pct));
  };
  setProgress(0);
  await nextFrame();
  // The physics binary is most of the download: the shared models and then the world are built while it still comes
  // in (on a phone the game's scripts are there in half the time), their static boxes queued until it is up.
  const physics = new Physics();
  const physicsUp = (options.physicsReady ?? loadRapier()).then((R) => {
    loadMark('physics-start');
    physics.attach(R);
    loadMark('physics-done');
  });
  // Handled at once, so a failure is not reported as unhandled before it is awaited below.
  void physicsUp.catch(() => {});
  await loadTrainModel('c20');
  await loadTrainModel('c30');
  await loadTrainModel('silver');
  if (era.past) { await loadTrainModel('retro'); await loadTrainModel('retro30'); }
  loadMark('models-done');
  const net = NETWORK;
  const line = net.lines[0];
  setProgress(0.05);
  await nextFrame();

  // Battery saver asks for the power-saving GPU: on a laptop with two, the other one is what starts the fans.
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: settings.value.battery ? 'low-power' : 'high-performance' });
  renderer.domElement.className = 'game-canvas';
  renderer.domElement.setAttribute('aria-label', 'Under Stockholm game view');
  root.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(FOG);
  scene.fog = new Fog(FOG, 30, 175);
  scene.add(new HemisphereLight(0xe9efff, 0x3b342c, 2.4));

  loadMark('world-start');
  const world = await World.load(physics, net, (fraction) => setProgress(0.05 + fraction * 0.45));
  loadMark('world-done');
  // Choose and build the starting view while the physics binary is still downloading. The layout already has
  // every station's spawn and colliders; geometry needs neither Rapier nor a player instance.
  const lineServices = networkServices(net);
  const timetables = lineServices.flatMap((s) => s.timetables);
  const timetable = timetables[0];
  const slots = networkSlots(net, lineServices, lineServices.map((l, li) => Math.max(0, REAL_SLOTS[li] - l.services.length)));
  const operations = new Operations({ slots, timetables });
  const POOL = slots.length;
  let time = startTime(timetable, params, debug);
  const followClock = !debug;
  const fixedClock = debug && (params.has('t') || params.has('clock') || freezeTimetable);
  const spawnAt = (station: number, track: 1 | 2) => {
    const s = world.stations[station];
    const travel = track === 1 ? 1 : -1;
    const z = trackSide(travel) * 2.2;
    const fx = -travel * 0.55;
    const fz = Math.sign(z) * 0.84;
    return { feet: new Vector3(s.cx - s.exitDir * 20, PLATFORM_Y, z), yaw: Math.atan2(-fx, -fz) };
  };
  let spawn = { feet: world.stations[0].spawn.clone(), yaw: -Math.PI / 2 };
  if (!debug && serviceOpen(time)) {
    let best = Infinity;
    world.stations.forEach((s) => ([1, 2] as const).forEach((track) => {
      if (net.stations[s.index].line !== 0 || net.stations[s.index].branch || isLineTerminal(net, s.index, track)) return;
      const arrival = operations.nextArrival(time, s.index, track, 600);
      if (arrival && arrival.eta >= 12 && arrival.eta < best) {
        best = arrival.eta;
        spawn = spawnAt(s.index, track);
      }
    }));
  }
  const place = options.resume ? savedPlace() : null;
  const divePlan = options.trip ? planTrip(net, options.trip.from, options.trip.to) : null;
  const diveTo = divePlan ? divePlan.legs[0].from : options.station ? net.stations.findIndex((s) => s.name === options.station) : -1;
  const startX = diveTo >= 0 ? world.stations[diveTo].cx : place?.x ?? (debug && params.has('x') ? Number(params.get('x')) : spawn.feet.x);
  loadMark('near-start');
  await world.prepare(startX);
  loadMark('near-done');
  setProgress(0.7);
  // Trains, the player and everything after them need Rapier itself.
  await physicsUp;
  scene.add(world.group);
  // The sky over the open-air stretches; underground the rock hides it.
  const sky = new Sky();
  scene.add(sky.mesh);
  const underground = new Color(FOG);
  const hemisphere = scene.children.find((o): o is HemisphereLight => o instanceof HemisphereLight)!;
  const settle = async (fraction: number) => {
    setProgress(fraction);
    await nextFrame();
  };
  // Lazily built sections are drawn once into a 1x1 target before their first real frame, so their buffers and textures are already on the GPU.
  const warmTarget = new WebGLRenderTarget(1, 1);
  const warmCamera = new PerspectiveCamera(60, 1, 0.1, 10);
  const warmScene = new Scene();
  warmScene.fog = scene.fog;
  warmScene.add(new HemisphereLight(0xe9efff, 0x3b342c, 2.4));
  world.warm = (object: Object3D) => {
    const parent = object.parent;
    const index = parent?.children.indexOf(object) ?? -1;
    const target = renderer.getRenderTarget();
    const restore: Array<[Object3D, boolean, boolean]> = [];
    object.traverse((o) => {
      restore.push([o, o.visible, o.frustumCulled]);
      o.visible = true;
      o.frustumCulled = false;
    });
    // Match the real scene's fog and lights, otherwise warming compiles a different shader.
    warmScene.add(object);
    try {
      renderer.setRenderTarget(warmTarget);
      renderer.render(warmScene, warmCamera);
    } finally {
      warmScene.remove(object);
      // three.js keeps the last frame's render list, which would hold the object after it is taken down and freed:
      // an empty frame lets go of it.
      renderer.render(warmScene, warmCamera);
      renderer.setRenderTarget(target);
      if (parent) {
        parent.add(object);
        parent.children.splice(parent.children.indexOf(object), 1);
        parent.children.splice(index, 0, object);
      }
      for (const [o, visible, culled] of restore) { o.visible = visible; o.frustumCulled = culled; }
    }
  };

  const services: Service[] = [];
  let trainSlice = performance.now();
  loadMark('trains-start');
  for (let index = 0; index < POOL; index++) {
    const offset = operations.offsets[index] ?? 0;
    // The red line runs the C30, the others the C20.
    const train = new Train(physics, index, net.lines[slots[index].line].id === 'red' ? 'c30' : 'c20');
    const tt = operations.timetableOf(index);
    const st = tt.stateAt(time + offset);
    train.place(st.x, st.z, st.y);
    const spare = !!slots[index].spare;
    if (spare) train.setActive(false);
    scene.add(train.group);
    const slot = services.filter((s) => s.line === slots[index].line).length;
    services.push({ index, train, timetable: tt, offset, clock: time + offset, rate: 1, route: slots[index].route, line: slots[index].line, journey: null, state: null, active: !spare, delay: 0, brake: null, slot });
    setProgress(0.7 + 0.15 * (index + 1) / POOL);
    if (performance.now() - trainSlice >= LOADING_SLICE_MS) {
      await nextFrame();
      trainSlice = performance.now();
    }
  }
  loadMark('trains-done');
  /** A service's state `ahead` game seconds from now, with speed in game time. */
  const stateOf = (svc: Service, ahead = 0): TrainState => {
    if (svc.brake) return svc.brake.stateAt(time + ahead);
    const st = svc.timetable.stateAt(svc.clock + ahead * svc.rate);
    return svc.rate === 1 ? st : { ...st, speed: st.speed * svc.rate };
  };

  // Real trains: SL's live departures drive the same trains when chosen in the pause menu, line by line.
  const real = new RealTrains(net.lines.map((l, li) => ({
    timetables: lineServices[li].timetables,
    routes: l.routes.map((r) => r.number),
    slots: REAL_SLOTS[li],
    stations: net.stations.map((s) => s.lines.includes(li)),
  })), net.stations.map((s) => s.sl ?? 0));
  // SL drives the trains unless the player chose the timetable. Debug keeps to the timetable unless asked, so scripted scenes repeat.
  let realWanted = false;
  if (realTrainsAvailable()) {
    let chosen: string | null = null;
    try { chosen = localStorage.getItem('under-stockholm:real'); } catch { /* No choice saved. */ }
    realWanted = debug ? chosen === 'on' : chosen !== 'off';
  }
  /** Which lines SL drives right now; the others keep to the timetable. */
  let lineLive = net.lines.map(() => false);
  let realOn = false;
  let realFailShown = false;
  const routeIndex = (number: string) => Math.max(0, net.routes.findIndex((r) => r.number === number));

  const ghostRoute = line.routes.findIndex((r) => r.number === line.ghost!.route);
  const silver = new Silverpilen(timetables[ghostRoute], lineServices[0].headway / line.routes.length, world.kymlingeX);
  if (debug && params.has('silverpilen')) silver.summon(time);
  // While SL drives the blue line she finds her own gap between its trains.
  const realSilver = new RealSilverpilen(silver);
  const rivals: Rival[] = [];
  const silverTrain = new Train(physics, 99, 'silver');
  await settle(0.87);
  silverTrain.setActive(false);
  silverTrain.setDestination(text.silverpilen.destination);
  silverTrain.setInfo(text.silverpilen.info);
  silverTrain.setHeading(1);
  scene.add(silverTrain.group);
  // Pale passengers who never look up.
  const silverRiders = figureMesh(9, new MeshBasicMaterial({ color: 0xf2e6cf, transparent: true, opacity: 0.32, depthWrite: false, blending: AdditiveBlending }));
  trainPassengerPoses(silverTrain.seating).slice(0, 9).forEach((pose, i) => {
    paintFigure(silverRiders, i, { coat: 0xd8ccb4, skin: 0xefe6d6, hair: 0xcfc3aa, bag: 0xd8ccb4, trousers: 0xc4b89f, shoes: 0xb3a78e });
    drawFigure(silverRiders, i, pose, i * 3);
  });
  silverTrain.group.add(silverRiders);
  let silverState: SilverState | null = null;
  // The empty train that runs straight through a station now and then.
  const express = new Express(operations, world.stationX, (t, x0, x1, z) => {
    const s = silver.stateAt(t);
    return !!s && Math.abs(s.z - z) < 2 && s.x > x0 - 80 && s.x < x1 + 80;
  });
  const expressTrain = new Train(physics, 95);
  expressTrain.setActive(false);
  expressTrain.setDestination(text.express.sign);
  expressTrain.setInfo(text.express.sign);
  scene.add(expressTrain.group);
  await settle(0.89);
  let expressState: ExpressState | null = null;
  let expressSeen = -1;
  const silverSeen = new Set<string>();

  const hud = new Hud(root, net, touchMode);
  const audio = new Audio();
  const announcements = new AnnouncementTracker();
  let listening = debug;

  const player = new Player(physics, spawn.feet, spawn.yaw);
  // Field of view, volumes and keys follow the settings as they change.
  let boundKeys = '';
  settings.on((s) => {
    if (player.camera.fov !== s.fov) { player.camera.fov = s.fov; player.camera.updateProjectionMatrix(); }
    audio.setVolumes(s.volume);
    const keys = JSON.stringify(s.keys);
    if (keys !== boundKeys) { boundKeys = keys; hud.relabel(); }
  });
  const settingsPanel = new SettingsPanel(hud.settingsPanel, () => hud.showSettings(false), touchMode);
  // Esc in the book or the settings goes back to the pause menu (while rebinding, the panel takes it first).
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && hud.closePanel()) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, { capture: true });

  // Real boardings per station: T-Centralen fills up, Västra skogen stays quiet.
  const stationWeights = net.stations.map((_, i) => ridership(net, i));
  const escalatorBusy = stationWeights.map((w) => Math.min(1, busyness(time) * w));
  const crowd = new Crowd(world.stationX, services.map(({ train }) => train), world.stations.map((s) => s.exitDir), indexOf(net, 'T-Centralen'), stationWeights, world.stations.map((s) => s.platforms), world.stations.map((s) => ({ rise: s.escalator.rise, run: s.escalator.run, foot: s.escalator.wallX - s.cx, base: s.escalator.base })));
  scene.add(crowd.group);
  let people = false;
  try { people = localStorage.getItem('under-stockholm:passengers') === 'on'; } catch { /* Storage can be disabled. */ }
  crowd.setEnabled(people);
  hud.setCrowd(people);
  const cabin = new CabinLife(services.map((s) => s.train));
  // Life around the player speaks up now and then, not all the time. Lines that only say what can be seen, and
  // people's chatter, are never shown (the discovery book still counts them); the rest at most one every 20 s,
  // and voices one every 25 s.
  const quiet = new Set<string>([
    text.critters.pigeons, text.critters.rat, text.platform.collector,
    text.ambience.attendantNod, text.ambience.vendorHello, text.ambience.draft, text.ambience.phoneMusic, text.ambience.prosit, ...text.ambience.tourist,
    text.festive.lucia, text.festive.students, text.festive.party, text.express.caption,
    text.carriage.school, ...text.carriage.counting, ...text.platform.call.map(([caption]) => caption),
  ]);
  let ambientShown = -Infinity;
  let ambientSpoken = -Infinity;
  const ambient = {
    say: (message: string, seconds: number) => {
      const now = performance.now() / 1000;
      if (quiet.has(message) || now - ambientShown < 20) { hud.onText?.(message); return; }
      ambientShown = now;
      hud.say(message, seconds);
    },
    /** Something said out on the platform or in the hall: aboard with the doors shut, it is neither heard nor read. */
    sayOut: (message: string, seconds: number) => {
      if (riding && riding.doorsOpen < 0.3) { hud.onText?.(message); return; }
      ambient.say(message, seconds);
    },
    /** A voice out on the platform or in the hall. Browser speech cannot be muffled, so aboard with the doors shut it is not heard at all. */
    speak: (message: string, pitch: number, rate: number, lang?: string) => {
      if (riding && riding.doorsOpen < 0.3) return;
      ambient.speakHere(message, pitch, rate, lang);
    },
    /** A voice beside the player wherever they are, a fellow passenger in the carriage too. */
    speakHere: (message: string, pitch: number, rate: number, lang?: string) => {
      if (!audio.chatter) return;
      const now = performance.now() / 1000;
      if (now - ambientSpoken < 25) return;
      ambientSpoken = now;
      audio.speak(message, pitch, rate, undefined, lang);
    },
  };
  const escalatorLife = new EscalatorLife(scene, {
    say: (message, seconds) => hud.say(message, seconds),
    speak: ambient.speakHere,
  });
  await settle(0.91);
  let motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { const saved = localStorage.getItem('under-stockholm:motion'); if (saved !== null) motion = saved === 'on'; } catch { /* Keep system preference. */ }
  hud.setMotion(motion);
  const toggleMotion = () => {
    motion = !motion;
    hud.setMotion(motion);
    hud.say(motion ? text.motionOn : text.motionOff, 2);
    try { localStorage.setItem('under-stockholm:motion', motion ? 'on' : 'off'); } catch { /* Session preference still works. */ }
  };
  hud.motionButtons.forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); toggleMotion(); }));
  const toggleCrowd = () => {
    people = !people;
    crowd.setEnabled(people);
    hud.setCrowd(people);
    hud.say(people ? text.passengersOn : text.passengersOff, 2);
    try { localStorage.setItem('under-stockholm:passengers', people ? 'on' : 'off'); } catch { /* The current session still works. */ }
  };
  hud.crowdButtons.forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleCrowd();
  }));

  // The world above and around: night, wind, weather, music, fares, other players.
  const night = new Night(scene, world);
  const wind = new Wind(scene);
  const weather = new Weather(scene, world.stations, debug ? params.get('weather') : null, time);
  const openWeather = new OpenAirWeather(scene);
  const disruptions = new Disruptions(debug ? params.get('disruption') : null);
  const warnings = new Warnings(debug ? params.get('warning') : null);
  const buskers = world.stations.filter((s) => s.passage).map((s) => {
    const busker = new Busker(scene, s.passage!);
    world.interactables.push(busker.interactable);
    return busker;
  });
  const beltRiders = world.stations.filter((s) => s.passage).map((s) => new BeltRiders(scene, s.passage!));
  const saxophonists = world.stations.filter((s) => s.name === 'Kungsträdgården').map((s) => {
    const sax = new Saxophonist(scene, s);
    world.interactables.push(sax.interactable);
    return sax;
  });
  const rushes = world.stations.filter((s) => s.passage).map((s) => {
    const rush = new RushHour(scene, s.passage!, {
      say: (message, seconds) => hud.say(message, seconds),
      speak: (message, pitch, rate) => audio.speak(message, pitch, rate),
      lurch: (strength) => player.lurch(strength),
      escort: (to, yaw) => { void hud.blackout(() => player.teleport(to, yaw)); },
    }, touchMode);
    world.interactables.push(rush.interactable);
    return rush;
  });
  const ghosts = new Ghosts(scene, ghostUrl());
  let ghostsOn = true;
  try { ghostsOn = localStorage.getItem('under-stockholm:ghosts') !== 'off'; } catch { /* Default on. */ }
  hud.ghostButton.hidden = !ghosts.available;
  hud.setOption(hud.ghostButton, ghostsOn);
  ghosts.setEnabled(ghostsOn && ghosts.available);
  ghosts.onCount = (count) => {
    if (count === null || !ghostsOn) { hud.setGhostCount(null); return; }
    const others = Math.max(0, count - 1);
    // Nobody else down here says nothing at all.
    hud.setGhostCount(others === 0 ? null : others === 1 ? text.ghosts.one : format(text.ghosts.count, { count: others }));
  };
  const toggleGhosts = () => {
    if (!ghosts.available) return;
    ghostsOn = !ghostsOn;
    ghosts.setEnabled(ghostsOn);
    hud.setOption(hud.ghostButton, ghostsOn);
    if (!ghostsOn) hud.setGhostCount(null);
    hud.say(ghostsOn ? text.ghosts.on : text.ghosts.off, 2);
    try { localStorage.setItem('under-stockholm:ghosts', ghostsOn ? 'on' : 'off'); } catch { /* Session only. */ }
  };
  hud.ghostButton.addEventListener('click', (event) => { event.stopPropagation(); toggleGhosts(); });
  // People's voices are browser speech, the announcer's own voice: off until the player asks for them.
  try { audio.chatter = localStorage.getItem('under-stockholm:voices') === 'on'; } catch { /* Default off. */ }
  hud.setOption(hud.voiceButton, audio.chatter);
  hud.voiceButton.addEventListener('click', (event) => {
    event.stopPropagation();
    audio.chatter = !audio.chatter;
    hud.setOption(hud.voiceButton, audio.chatter);
    try { localStorage.setItem('under-stockholm:voices', audio.chatter ? 'on' : 'off'); } catch { /* Session only. */ }
  });

  const fares = new Fares(scene, physics, world.stations, services.map((s) => s.train), time, {
    say: (message, seconds) => hud.say(message, seconds),
    notice: (title, body, seconds) => hud.notice(title, body, seconds),
    escort: (to, yaw) => { void hud.blackout(() => player.teleport(to, yaw)); },
  });
  world.interactables.push(...fares.interactables);
  /** Lines for the pause menu, after the ticket: what you have found and explored. */
  const tallies: Array<() => string> = [];
  const pauseStatus = () => [fares.statusLine(), ...tallies.map((f) => f())].filter(Boolean).join(' · ');
  const hallLife = new HallLife(scene, world.stations, {
    say: ambient.sayOut,
    speak: ambient.speak,
    spend: (amount) => fares.spend(amount),
  });
  world.interactables.push(...hallLife.interactables);
  const footsteps = new Footsteps();
  const rideLight = new RideLight();
  // The time machine: the trains change stock, and SL's live trains belong to the present.
  const applyEra = () => {
    const look = era.past ? 'retro' : 'c20';
    for (const s of services) s.train.setLook(look);
    expressTrain.setLook(look);
    // The older stock is furnished differently: the passengers and the newspaper move, and whoever sat stands up.
    crowd.setSeating();
    cabin.setSeating();
    if (player.seated) {
      player.stand();
      hud.clearCaption(touchMode ? text.touch.seated : rebindText(text.seated));
    }
    rideLight.reset();
    hud.setEra(era.past);
    if (era.past && realWanted) { realWanted = false; real.setEnabled(false); hud.setOption(hud.realButton, false); }
  };
  hud.eraButton.addEventListener('click', (event) => {
    event.stopPropagation();
    era.set(era.past ? 'now' : '1975');
    hud.say(era.past ? text.era.to1975 : text.era.toNow, 5);
  });
  era.on(applyEra);
  applyEra();
  const signals = new Signals(scene, net, world.stationX);
  const tunnels = net.layout.links.filter((l) => !l.portal && !(world.kymlingeX > world.stationX[l.a] && world.kymlingeX < world.stationX[l.b])).map((l): [number, number] => [l.a, l.b]);
  await settle(0.94);
  // With the staff key an alarmed exit opens: up to the street, and back in through the station entrance.
  staffKey.onExit = (from) => {
    if (respawning) return;
    const out = audio.output;
    if (out) for (let k = 0; k < 12; k++) tone(out, out.cabin, 1150, 0.05, 0.12, { type: 'square', delay: k * 0.25 });
    respawning = true;
    void hud.blackout(() => {
      const s = world.nearestStation(from.x);
      player.teleport(new Vector3(s.hallX(17.5), s.hall.y, 0), s.exitDir > 0 ? Math.PI / 2 : -Math.PI / 2);
      hud.say(text.key.alarm, 7);
    }).then(() => (respawning = false));
  };
  tallies.push(() => (staffKey.has ? text.key.held : ''));
  artWalk.total = net.stations.filter((s) => artWalk.plaque(s.name)).length;
  artWalk.onRead = (title, body, progress, spoken) => {
    hud.notice(title, progress, 6);
    hud.say(body, Math.max(8, body.length / 14));
    // Read in Swedish whatever the menus' language: the voice is Swedish.
    audio.read(spoken);
  };
  mystery.onFind = (title, body, first) => {
    hud.notice(first ? `${text.mystery.found}: ${title}` : title, body, Math.max(7, body.length / 16));
  };
  tallies.push(() => (mystery.count ? format(text.mystery.tally, { count: mystery.count, total: CLUES.length }) : ''));
  tallies.push(() => (artWalk.count ? format(text.art.progress, { count: artWalk.count, total: artWalk.total }) : ''));
  const exploration = new Exploration(world);
  tallies.push(() => format(text.explore.tally, { count: exploration.count, total: exploration.total }));
  tallies.push(() => (lost.total ? format(text.lost.tally, { count: lost.total }) : ''));
  const trackWork = new TrackWork(scene, physics, world.stationX, tunnels, { say: (message, seconds) => hud.say(message, seconds) });
  const carriageLife = new CarriageLife(services.map((s) => s.train), {
    say: ambient.say,
    speak: ambient.speakHere,
  });
  let playerSeat: Seat | null = null;
  const coffee = new Coffee(scene, player.camera, world.stations, (amount) => fares.spend(amount), (message, seconds) => hud.say(message, seconds));
  world.interactables.push(...coffee.interactables);
  const effects = new Effects(scene, world.stations);
  const festivities = new Festivities(scene, world.stations, services.map((s) => s.train), { say: ambient.say });
  world.interactables.push(...festivities.interactables);
  const preacher = new Preacher(scene, world.stations, {
    say: (message, seconds) => { if (!(riding && riding.doorsOpen < 0.3 && preacher.train !== riding)) hud.say(message, seconds); },
    // Left behind on the platform, she is not heard through the closed doors.
    speak: (message, pitch, rate) => { if (!(riding && riding.doorsOpen < 0.3 && preacher.train !== riding)) audio.speak(message, pitch, rate); },
    lurch: (strength) => player.lurch(strength),
    doorsOpen: (train) => services.some((svc) => svc.train === train && (svc.state?.doors ?? 0) > 0.5),
  });
  world.interactables.push(preacher.interactable);
  const critters = new Critters(scene, { say: ambient.sayOut });
  const lost = new LostProperty(scene, world.stations, {
    say: (message, seconds) => hud.say(message, seconds),
    notice: (title, body, seconds) => hud.notice(title, body, seconds),
    pocketed: (kind, fresh) => bag.put(kind, fresh),
    handedIn: (reward) => { bag.empty(reward); fares.topUp(reward); },
    full: () => bag.full(),
  });
  world.interactables.push(...lost.interactables);
  // Handing in comes ahead of topping up the card at the same booth: the nearest wins, and the first on a tie.
  world.interactables.unshift(...lost.booths);
  // What the player carries, pictured from the things' own models.
  const bag = new Bag(hud.root, hud.pause.querySelector<HTMLElement>('#pause-book')!, renderIcons(renderer, propMaterial(), LOST_KINDS.map((kind): [string, BufferGeometry] => [kind, lost.geometry(kind)])), BAG_SIZE,
    (kind) => lost.nameOf(kind));
  bag.set(lost.carried);
  const platformLife = new PlatformLife(scene, {
    say: ambient.sayOut,
    speak: ambient.speak,
  });
  // The regulars: the same people in the same places every weekday, who come to know the player.
  const regulars = new RegularLife(scene, net.stations.map((s) => s.name), (name) => net.stations.findIndex((s) => s.name === name), operations, {
    say: (message, seconds, aboard) => (aboard ? ambient.say : ambient.sayOut)(message, seconds),
    speak: (message, pitch, rate, aboard) => (aboard ? ambient.speakHere : ambient.speak)(message, pitch, rate),
    seen: (message) => hud.onText?.(message),
  });
  const ambience = new Ambience(world.stations, {
    say: ambient.say,
    speak: ambient.speakHere,
    jolt: (strength) => player.jolt(strength),
  });

  let driving = false;
  const practice = new Train(physics, 90, 'cab');
  scene.add(practice.group);
  // The practice line runs straight along x: the trunk and the Akalla branch.
  const driverRoute = net.layout.routes[ghostRoute].stations;
  const driver = new Driver(practice, driverRoute.map((i) => world.stationX[i]), driverRoute.map((i) => net.stations[i].name), {
    say: (message, seconds) => hud.say(message, seconds),
    chime: () => audio.chime(1),
    finished: () => stopDriving(),
  });
  await settle(0.97);

  let renderNeeded = true;
  let pixel = false;
  // Adaptive resolution (`resolution.ts`), fed each frame's time and the last frame's own work.
  const resolution = new AdaptiveResolution();
  /** Whether the player has been told about battery saver, once a visit. */
  let batteryTold = false;
  /** The last frame's own work, from its start to the end of the render call. */
  let workMs = 0;
  const resize = () => {
    renderNeeded = true;
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    const most = settings.value.battery ? 1 : touchMode ? 1.5 : 2;
    renderer.setPixelRatio(pixel ? 0.42 : Math.min(window.devicePixelRatio, most) * resolution.scale);
    renderer.setSize(w, h, true);
    renderer.domElement.classList.toggle('is-pixel', pixel);
    player.camera.aspect = w / h;
    player.camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  // Touch play never needs pointer lock. All pause paths clear held input.
  const canvas = renderer.domElement;
  // The baked world lives only on the GPU (`dropArray` in `section.ts`), so a lost context cannot be filled again:
  // the page comes back instead, where the player stood, also when the browser never restores the context. The loss
  // is reported, since to the player it only looks like the game jumping back: apart, a loss in a tab that was just
  // hidden (a phone freeing a page in the background, which the reload handles) from one in the middle of play.
  let shownAt = -Infinity;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) shownAt = performance.now(); });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    const away = document.hidden || performance.now() - shownAt < CONTEXT_AWAY;
    reportError(new Error(away ? 'WebGL context lost in the background' : 'WebGL context lost while playing'), false);
    try { rememberPlace(); } catch { /* The page comes back to the last place kept. */ }
    window.setTimeout(() => { comeBack(); location.reload(); }, CONTEXT_WAIT);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    rememberPlace();
    comeBack();
    location.reload();
  });
  let paused = !debug;
  let touch: TouchControls | null = null;
  const setPaused = (value: boolean) => {
    renderNeeded = true;
    paused = value;
    player.enabled = listening = !value;
    hud.setPaused(value);
    touch?.setEnabled(!value);
    if (value) {
      player.resetInput(); audio.suspend(); hud.setTicket(pauseStatus()); bag.showCollection(lost.kinds, LOST_KINDS);
      hud.setTripHere(world.nearestStation(player.feet.x).name);
    }
  };
  const resume = () => {
    stageArrival();
    audio.start();
    hud.resumeButton.blur();
    if (touchMode) { setPaused(false); return; }
    if (debug) {
      // Debug never pauses, so headless screenshots work, but a click still takes the mouse for looking around.
      setPaused(false);
      try { void (canvas.requestPointerLock() as Promise<void> | undefined)?.catch(() => {}); } catch { /* Keyboard only. */ }
      return;
    }
    if (typeof canvas.requestPointerLock !== 'function') { setPaused(true); return; }
    try {
      // Older Safari versions may return void instead of a promise.
      const result = canvas.requestPointerLock() as Promise<void> | undefined;
      void result?.catch(() => setPaused(true));
    } catch { setPaused(true); }
  };
  const pause = () => {
    setPaused(true);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  const toggleSound = () => {
    const muted = audio.toggleMute();
    hud.setOption(hud.soundButton, !muted);
    hud.say(muted ? text.soundOff : text.soundOn, 2);
  };
  const togglePixels = () => {
    pixel = !pixel;
    hud.setOption(hud.pixelButton, pixel);
    resize();
  };
  hud.resumeButton.addEventListener('click', resume);
  hud.langButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const next = lang() === 'sv' ? 'en' : 'sv';
    setLang(next);
    saveLang(next);
    hud.relabel();
    touch?.relabel();
    settingsPanel.render(touchMode);
    renderBook();
    bag.showCollection(lost.kinds, LOST_KINDS);
    hud.setTicket(pauseStatus());
  });
  hud.soundButton.addEventListener('click', toggleSound);
  hud.pixelButton.addEventListener('click', togglePixels);
  hud.setOption(hud.batteryButton, settings.value.battery);
  hud.batteryButton.addEventListener('click', (event) => {
    event.stopPropagation();
    settings.change((s) => { s.battery = !s.battery; });
    hud.setOption(hud.batteryButton, settings.value.battery);
    resize();
  });
  hud.unstuckButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (driving) stopDriving();
    else if (!respawning && !saver.active && !show.active) respawn(text.unstuck.done);
    resume();
  });
  hud.driverButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (driving) stopDriving(); else startDriving();
    resume();
  });
  hud.realButton.hidden = !realTrainsAvailable();
  hud.setOption(hud.realButton, realWanted);
  real.setEnabled(realWanted);
  hud.realButton.addEventListener('click', (event) => {
    event.stopPropagation();
    realWanted = !realWanted;
    realFailShown = false;
    real.setEnabled(realWanted);
    hud.setOption(hud.realButton, realWanted);
    hud.say(realWanted ? text.real.loading : text.real.off, 3);
    try { localStorage.setItem('under-stockholm:real', realWanted ? 'on' : 'off'); } catch { /* Session only. */ }
  });
  canvas.addEventListener('click', () => { if (!touchMode) resume(); });
  /** While writing a note the mouse is free, and that must not pause the game. */
  let typing = false;
  document.addEventListener('pointerlockchange', () => {
    if (!touchMode && !debug && !typing) setPaused(document.pointerLockElement !== canvas);
  });
  noteWriter.open = () => {
    if (typing) return;
    typing = true;
    if (document.pointerLockElement) document.exitPointerLock();
    player.resetInput();
    player.enabled = false;
    void hud.askNote().then(async (note) => {
      typing = false;
      player.enabled = !paused;
      if (note) hud.say(await sharedNotes.post(note), 5);
      if (!touchMode && !debug) resume();
    });
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => { if (touchMode) pause(); });
  if (touchMode) touch = new TouchControls(root, canvas, {
    move: (forward, side) => player.setTouchMovement(forward, side),
    look: (dx, dy) => player.look(dx, dy),
    run: (enabled) => player.setTouchRunning(enabled),
    jump: () => player.jump(), sit: () => interactSeat(), climb: () => climb(), use: () => use(),
    throttle: (delta) => driver.throttle(delta), doors: () => driver.toggleDoors(),
    pause, map: () => hud.toggleMap(), activateAudio: () => audio.start(),
  });
  setPaused(!debug);

  // Screensaver mode: the camera rides the line on its own until any key, click or touch.
  const saver = new Screensaver({
    trains: () => services.filter((s) => s.active && s.state).map((s) => {
      const stop = s.timetable.stops[s.state!.phase === 'moving' ? s.state!.next : s.state!.stop];
      return { train: s.train, state: s.state!, heading: stop.track === 1 ? 1 : -1, toStation: stop.kind === 'station' };
    }),
    stations: world.stations,
    arrival: (station, track) => operations.nextArrival(time, station, track, 120)?.eta ?? null,
    teleport: (feet, yaw) => { player.teleport(feet, yaw); world.ensureBuilt(feet.x); },
    eye: (at) => { player.driveEye = at; },
    look: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
    blackout: (during) => hud.blackout(during),
  });
  const startSaver = () => {
    if (saver.active || driving) return;
    audio.start();
    if (document.pointerLockElement) document.exitPointerLock();
    setPaused(false);
    player.enabled = false;
    hud.setScreensaver(true);
    saver.start(audio.output);
  };
  const stopSaver = () => {
    if (!saver.active) return;
    saver.stop();
    player.driveEye = null;
    hud.setScreensaver(false);
    player.enabled = !paused;
  };
  hud.saverButton.addEventListener('click', (event) => { event.stopPropagation(); startSaver(); });

  // The showcase: a tour of the moments most players never happen to see, each at its own time.
  const sceneText = text.show.scenes as Record<string, string[]>;
  /** Near the far end of the platform, by the edge and clear of the pillars, looking back toward the tunnel a train on this track comes out of. */
  const platformPose = (station: number, track: 1 | 2): ShowPose => {
    const s = world.stations[station];
    const dir = track === 1 ? 1 : -1;
    const z = trackSide(dir) * (PLATFORM_HALF_W - 1.1);
    const yaw = (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + (z > 0 ? -0.2 : 0.2) * dir;
    return { x: s.cx + dir * (PLATFORM_HALF_L - 12), y: PLATFORM_Y, z, yaw, pitch: 0, pan: -dir * 0.008 };
  };
  /** A little before the next train reaches a station, by day. */
  const beforeTrain = (start: number, station: number, track: 1 | 2) => {
    const base = daytime(start);
    const next = operations.nextArrival(base, station, track, 900);
    return next ? base + Math.max(0, next.eta - 12) : base;
  };
  const stationIndex = (name: string) => Math.max(0, indexOf(net, name));
  const tCentralen = stationIndex('T-Centralen');
  let silverAt: { station: number; time: number } | null = null;
  const showScene = (key: string, seconds: number, rest: Omit<ShowScene, 'title' | 'sub' | 'seconds'>): ShowScene => ({ title: sceneText[key][0], sub: sceneText[key][1], seconds, ...rest });
  const scenes: ShowScene[] = [
    showScene('now', 16, { at: (start) => beforeTrain(start, tCentralen, 1), pose: () => platformPose(tCentralen, 1) }),
    showScene('rush', 16, {
      at: (start) => weekdayAt(start, 8, 10),
      pose: () => {
        const p = world.stations.find((s) => s.passage)?.passage;
        return p ? { x: (p.bounds.x0 + p.bounds.x1) / 2, y: p.bounds.y, z: p.bounds.z0 + 20, yaw: Math.PI, pitch: 0, pan: 0.004 } : null;
      },
    }),
    showScene('snow', 15, {
      at: (start) => dateAt(start, 12, 20, 17, 40),
      weather: 'snow',
      pose: () => {
        const s = world.stations[tCentralen];
        return { x: s.hall.x0 + 2, y: s.gates.y, z: 0, yaw: -Math.PI / 2, pitch: 0.06, pan: 0 };
      },
    }),
    showScene('lucia', 20, {
      at: (start) => dateAt(start, 12, 13, 7, 50),
      pose: () => {
        const s = world.stations[tCentralen];
        const { x, dir } = luciaPose(time);
        const reach = PLATFORM_HALF_L - 4;
        return { x: s.cx + Math.max(-reach, Math.min(reach, x + dir * 15)), y: PLATFORM_Y, z: PLATFORM_HALF_W - 1.1, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, pitch: -0.02, pan: 0 };
      },
    }),
    showScene('era', 16, { at: (start) => beforeTrain(start, stationIndex('Rådhuset'), 2), era: '1975', pose: () => platformPose(stationIndex('Rådhuset'), 2) }),
    showScene('silver', 30, {
      at: (start) => {
        silverAt = silverStop(silver, daytime(start));
        return silverAt ? silverAt.time - 14 : start;
      },
      pose: () => (silverAt ? platformPose(silverAt.station, 1) : null),
    }),
    showScene('trackWork', 16, {
      at: (start) => weekdayAt(start, 2, 40),
      pose: () => {
        const site = trackWork.siteAt(time);
        return { x: site.x - site.dir * 20, y: 0.3, z: site.z, yaw: site.dir < 0 ? Math.PI / 2 : -Math.PI / 2, pitch: 0.02, pan: 0 };
      },
    }),
    showScene('kymlinge', 14, {
      at: (start) => start,
      pose: () => {
        const k = world.kymlinge.spawn;
        return { x: k.x, y: k.y, z: k.z, yaw: -Math.PI / 2, pitch: 0.04, pan: 0.006 };
      },
    }),
  ];
  /** What the tour borrows, to give back when it ends. */
  let showSaved: { weather: typeof weather.state; era: Era; real: boolean; feet: Vector3; yaw: number; pitch: number } | null = null;
  let showOffset = 0;
  let showMusic: Music | null = null;
  const show = new Showcase({
    time: () => time,
    jump: (to) => { showOffset += to - time; jumpTime(to); },
    setup: (next) => {
      if (!showSaved) return;
      weather.state = next?.weather
        ? { kind: next.weather, intensity: next.weather === 'clear' || next.weather === 'cloudy' ? 0 : 0.8, temperature: next.weather === 'snow' ? -4 : 8, source: 'debug' }
        : showSaved.weather;
      era.set(next ? next.era ?? 'now' : showSaved.era, false);
    },
    place: (p) => {
      player.driveEye = null;
      player.teleport(new Vector3(p.x, p.y, p.z), p.yaw);
      player.pitch = p.pitch;
      world.ensureBuilt(p.x);
    },
    look: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
    title: (title, sub) => hud.setShowTitle(title, sub),
    blackout: (during) => hud.blackout(during),
  }, scenes);
  const startShow = () => {
    if (show.active || saver.active || driving) return;
    audio.start();
    if (document.pointerLockElement) document.exitPointerLock();
    showSaved = { weather: weather.state, era: era.get(), real: realWanted, feet: player.feet.clone(), yaw: player.yaw, pitch: player.pitch };
    if (realWanted) { realWanted = false; real.setEnabled(false); }
    crowd.setEnabled(true);
    ghosts.setEnabled(false);
    setPaused(false);
    player.enabled = false;
    hud.setScreensaver(true);
    const out = audio.output;
    if (out) { showMusic ??= new Music(out); showMusic.play(true); }
    show.begin();
  };
  const stopShow = () => {
    if (!show.active || !showSaved) return;
    const saved = showSaved;
    show.end();
    showSaved = null;
    showMusic?.play(false);
    crowd.setEnabled(people);
    ghosts.setEnabled(ghostsOn && ghosts.available && !loopOffset);
    realWanted = saved.real;
    real.setEnabled(realWanted);
    showOffset = 0;
    jumpTime(followClock ? Date.now() / 1000 + (ghosts.clockOffset ?? 0) + loopOffset : show.startedAt);
    player.teleport(saved.feet, saved.yaw);
    player.pitch = saved.pitch;
    world.ensureBuilt(saved.feet.x);
    hud.setScreensaver(false);
    player.enabled = !paused;
  };
  hud.showButton.addEventListener('click', (event) => { event.stopPropagation(); startShow(); });

  // A life on the blue line: one ride to Akalla, every station a stretch of years, from 1975 to 2050.
  const lifeCompany = new LifeCompany(scene);
  let life: { service: Service; stops: number[]; scenes: LifeScene[]; index: number; until: number; seat: Seat | null; cutting: boolean; saved: { era: Era; feet: Vector3; yaw: number; real: boolean; time: number; back: number } } | null = null;
  /** The next Akalla train out of Kungsträdgården, from `from`, and the stops of its run. */
  const lifeRun = (from: number): { service: Service; stops: number[]; first: number } | null => {
    let best: { service: Service; stops: number[]; first: number } | null = null;
    for (const svc of services) {
      if (svc.line !== 0 || net.routes[svc.route]?.number !== '11') continue;
      const tt = svc.timetable;
      const k = tt.stopIndex(0, 1);
      if (k < 0) continue;
      const eta = tt.secondsUntil(from + svc.offset, k);
      if (!operations.inService(from + eta, svc.index) || (best && from + eta >= best.first)) continue;
      const stops = [k];
      for (let n = 1; n < tt.stops.length; n++) {
        const st = tt.stops[(k + n) % tt.stops.length];
        if (st.kind !== 'station' || st.track !== 1) break;
        stops.push((k + n) % tt.stops.length);
      }
      best = { service: svc, stops, first: from + eta };
    }
    return best;
  };
  const lifeStage = () => {
    if (!life) return;
    const l = life;
    const sceneNow = l.scenes[l.index];
    era.set(sceneNow.era, false);
    lifeYear = sceneNow.year;
    const svc = l.service;
    // The clock as it was, then on to this station on the same run.
    const arrive = l.saved.time + svc.timetable.secondsUntil(l.saved.time + svc.offset, l.stops[0]) + (svc.timetable.arrival(l.stops[l.index]) - svc.timetable.arrival(l.stops[0]) + svc.timetable.cycle) % svc.timetable.cycle;
    // Like the tour, the jump holds against the wall clock.
    showOffset += arrive - LIFE_BEFORE - time;
    jumpTime(arrive - LIFE_BEFORE);
    const train = svc.train;
    world.ensureBuilt(train.position.x);
    const forward = Math.PI / 2;
    const rank = (seat: Seat) => (Math.cos(seat.yaw - forward) > 0.9 ? 0 : 100) + Math.abs(seat.x - 2);
    const taken = occupiedSeatPoses(train.seating);
    const seat = cabinSeats(train.seating).filter((c) => !taken.some((p) => Math.abs(p.x - c.x) < 0.2 && Math.abs(p.z - c.z) < 0.2)).sort((a, b) => rank(a) - rank(b))[0] ?? null;
    if (player.seated) player.stand();
    if (seat) { player.sit(seat, train.position.x, train.position.z, PLATFORM_Y); playerSeat = seat; }
    l.seat = seat;
    player.eyeScale = sceneNow.eye;
    l.until = time + LIFE_BEFORE + LIFE_AFTER;
  };
  const startLife = () => {
    if (life || show.active || saver.active || driving) return;
    const from = serviceOpen(time) ? time : time + 6 * 3600;
    const run = lifeRun(from);
    if (!run) return;
    audio.start();
    if (document.pointerLockElement) document.exitPointerLock();
    life = { service: run.service, stops: run.stops, scenes: lifeScenes(run.stops.length), index: 0, until: Infinity, seat: null, cutting: true,
      saved: { era: era.get(), feet: player.feet.clone(), yaw: player.yaw, real: realWanted, time: from, back: time } };
    if (realWanted) { realWanted = false; real.setEnabled(false); }
    crowd.setEnabled(true);
    ghosts.setEnabled(false);
    setPaused(false);
    player.enabled = false;
    hud.setScreensaver(true);
    const out = audio.output;
    if (out) { showMusic ??= new Music(out); showMusic.play(true); }
    void hud.blackout(lifeStage).then(() => { if (life) life.cutting = false; });
  };
  function stopLife(): void {
    if (!life) return;
    const saved = life.saved;
    life = null;
    lifeYear = null;
    lifeCompany.hide();
    showMusic?.play(false);
    player.eyeScale = 1;
    if (player.seated) player.stand();
    era.set(saved.era, false);
    crowd.setEnabled(people);
    ghosts.setEnabled(ghostsOn && ghosts.available && !loopOffset);
    realWanted = saved.real;
    real.setEnabled(realWanted);
    showOffset = 0;
    jumpTime(followClock ? Date.now() / 1000 + (ghosts.clockOffset ?? 0) + loopOffset : saved.back);
    player.teleport(saved.feet, saved.yaw);
    world.ensureBuilt(saved.feet.x);
    hud.setScreensaver(false);
    player.enabled = !paused;
  }
  /** Per frame while a life plays: the company around you, and on to the next station when this one is done. */
  function updateLife(dt: number): void {
    if (!life) return;
    const l = life;
    const sceneNow = l.scenes[l.index];
    if (l.seat) lifeCompany.update(dt, sceneNow, l.service.train.position, l.seat, l.service.train.seating);
    if (l.cutting || time < l.until) return;
    l.cutting = true;
    if (l.index + 1 >= l.scenes.length) {
      // The end of the line: a long dark, then the present.
      void hud.blackout(() => stopLife());
      return;
    }
    void hud.blackout(() => { l.index++; lifeStage(); }).then(() => { l.cutting = false; });
  }
  hud.lifeButton.addEventListener('click', (event) => { event.stopPropagation(); startLife(); });

  for (const type of ['keydown', 'pointerdown', 'touchstart'] as const) {
    window.addEventListener(type, (e) => {
      if (!saver.active && !show.active && !life) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      stopSaver();
      stopShow();
      stopLife();
      if (!touchMode && !debug) pause();
    }, { capture: true });
  }
  if (params.has('screensaver')) startSaver();

  // The discovery book: every caption and notice on screen is checked against it. The screensaver's are not seen.
  const book = new DiscoveryBook();
  const items: Record<string, string[]> = text.discover.items;
  const groupNames = text.discover.groups as Record<string, string>;
  const progress = () => format(text.discover.progress, { count: book.count, total: book.total });
  const renderBook = () => hud.setBook(GROUPS.map((g) => ({
    title: groupNames[g],
    items: DISCOVERIES.filter((d) => d.group === g).map((d) => ({ title: items[d.id][0], hint: items[d.id][1], found: book.has(d.id) })),
  })), progress());
  book.onFind = (id) => {
    hud.discovered(format(text.discover.toast, { title: items[id][0], count: book.count, total: book.total }));
    renderBook();
  };
  hud.onText = (message) => { if (!saver.active && !show.active) book.see(message); };
  renderBook();

  // Keys go through the player's bindings (`settings.ts`); Escape always pauses and the arrows always walk.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || settingsPanel.capturing || (e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, a'))) return;
    if (e.code === 'Escape') { pause(); return; }
    const action = settings.action(e.code);
    if (action === 'screensaver' && !driving) { startSaver(); return; }
    if (action === 'passengers') toggleCrowd();
    if (action === 'mute') toggleSound();
    if (action === 'motion') toggleMotion();
    if (action === 'pixels') togglePixels();
    if (action === 'help') hud.toggleHelp();
    if (action === 'ghosts') toggleGhosts();
    if (action === 'map') hud.toggleMap();
    if (!player.enabled) return;
    if (action === 'drive') { if (driving) stopDriving(); else startDriving(); return; }
    if (driving) {
      if (action === 'forward' || e.code === 'ArrowUp') driver.throttle(1);
      if (action === 'back' || e.code === 'ArrowDown') driver.throttle(-1);
      if (action === 'jump') driver.emergencyBrake();
      if (action === 'use') driver.toggleDoors();
      if (action === 'punch') stopDriving();
      return;
    }
    if (action === 'sit') interactSeat();
    if (action === 'punch') for (const rush of rushes) rush.punch();
    if (action === 'use') { if (world.canClimb(player.feet)) climb(); else use(); }
  });

  // A gamepad, polled every frame: it can also resume from the menu without the mouse.
  const pads = new Gamepads({
    move: (forward, side, running) => player.setPadMovement(forward, side, running),
    look: (dx, dy) => { if (player.enabled) player.look(dx, dy); },
    jump: () => player.jump(),
    use: () => { if (world.canClimb(player.feet)) climb(); else use(); },
    sit: () => interactSeat(),
    map: () => hud.toggleMap(),
    help: () => hud.toggleHelp(),
    pause: () => {
      if (saver.active || show.active) { stopSaver(); stopShow(); return; }
      if (!paused) { pause(); return; }
      stageArrival();
      audio.start();
      setPaused(false);
    },
    throttle: (delta) => driver.throttle(delta),
    doors: () => driver.toggleDoors(),
    brake: () => driver.emergencyBrake(),
    stopDriving: () => stopDriving(),
    connected: (on) => hud.say(on ? text.settings.gamepadOn : text.settings.gamepadOff, 3),
  });

  // Key hints, each once, the first time it matters.
  const tips = new FirstSteps((message) => hud.tip(message));
  let playedFor = 0;
  /** How a hint names a control: the bound key, the gamepad's button or the touch button. */
  const controlName = (action: 'use' | 'sit') => (pads.active ? (action === 'use' ? 'X' : 'B') : touchMode ? (action === 'use' ? text.touch.use : text.touch.sit) : keyName(settings.key(action)));

  // Where the player stands is kept every few seconds, for "continue where you were" on the landing page.
  let placeTimer = 0;
  function rememberPlace(): void {
    if (debug || saver.active || show.active || driving || loopOffset || respawning || era.past) return;
    const s = world.nearestStation(player.feet.x);
    // Aboard, or somewhere odd, the nearest station's platform is the safer place to come back to.
    const odd = riding || player.feet.y < -1;
    const feet = odd ? s.spawn : player.feet;
    const yaw = odd ? (s.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2) : player.yaw;
    savePlace({ x: feet.x, y: feet.y, z: feet.z, yaw, station: s.name, at: Date.now() });
  }
  // A left click punches, while the mouse is captured.
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !player.enabled || driving || document.pointerLockElement !== canvas) return;
    for (const rush of rushes) rush.punch();
  });

  const stationName = (i: number) => net.stations[i].name;
  const destinationText = (st: TrainState, svc: Service): string => {
    const stop = svc.timetable.stops[st.phase === 'moving' ? st.next : st.stop];
    if (stop.kind === 'turnback') return 'Ej i trafik';
    if (svc.journey) return `${svc.journey.line} ${svc.journey.destination}`;
    const destination = serviceDestination(net, svc.route, stop.track);
    return `${destination.number} ${destination.name}`;
  };
  /**
   * What a train's own signs say: the destination alone outside and "Mot ..." inside, without the route number, which
   * SL shows on the platforms' boards but the C20's signs cannot.
   */
  const trainSigns = (st: TrainState, svc: Service): [string, string] => {
    const stop = svc.timetable.stops[st.phase === 'moving' ? st.next : st.stop];
    if (stop.kind === 'turnback') return ['Ej i trafik', 'Ej i trafik'];
    const name = svc.journey ? svc.journey.destination : serviceDestination(net, svc.route, stop.track).name;
    return [name, `Mot ${name}`];
  };
  const infoText = (st: TrainState, svc: Service): string => {
    const tt = svc.timetable;
    if (st.phase === 'moving') {
      const next = tt.stops[st.next];
      return next.kind === 'station' ? `Nästa: ${stationName(next.station)}` : 'Ej i trafik';
    }
    const here = tt.stops[st.stop];
    return here.kind === 'station' ? stationName(here.station) : 'Ej i trafik';
  };

  let riding: Train | null = null;
  let respawning = false;

  /** Every train that can carry the player right now. */
  const carriers = (): Train[] => {
    const list = services.filter((s) => s.train.isActive).map((s) => s.train);
    if (silverTrain.isActive) list.push(silverTrain);
    if (driving) list.push(driver.train);
    return list;
  };
  const trainUnderFeet = () => carriers().find((t) => t.containsFeet(player.feet)) ?? null;

  // The emergency brake, on the panels by every door.
  let brakeReady = 0;
  const brakeTalk = new Set<string>();
  const brakeService = () => {
    if (realOn || driving || !riding || time < brakeReady) return null;
    const svc = services.find((s) => s.train === riding && s.active && s.state);
    if (!svc || svc.brake || !svc.state || svc.state.phase !== 'moving' || svc.state.speed < 4) return null;
    if (svc.timetable.stops[svc.state.next].kind !== 'station') return null;
    const lx = player.feet.x - riding.position.x;
    return riding.stock.doors.some((d) => Math.abs(lx - d) < 1.7) ? svc : null;
  };
  const brakeHandle = {
    pos: new Vector3(), radius: 2, prompt: () => text.brake.prompt,
    enabled: () => brakeService() !== null,
    act: () => {
      const svc = brakeService();
      if (!svc || !svc.state) return;
      svc.brake = new BrakeOverride(svc.timetable, time, svc.clock, svc.state);
      brakeReady = time + 240;
      player.jolt(2.5);
      const out = audio.output;
      if (out) {
        noiseBurst(out, out.cabin, { type: 'bandpass', frequency: 2600, sweepTo: 1400, q: 5, volume: 0.35, attack: 0.05, decay: 3.2 });
        noiseBurst(out, out.cabin, { type: 'lowpass', frequency: 200, volume: 0.6, attack: 0.02, decay: 1.5, color: 'brown' });
      }
      return text.brake.pulled;
    },
  };
  world.interactables.push(brakeHandle);

  function interactSeat(): void {
    if (driving) return;
    if (player.seated) {
      player.stand();
      hud.clearCaption(touchMode ? text.touch.seated : rebindText(text.seated));
      return;
    }
    const train = trainUnderFeet();
    if (!train || Math.abs(player.feet.y - PLATFORM_Y) > 0.2) return;
    const seat = nearestSeat(player.feet.x - train.position.x, player.feet.z - train.position.z, occupiedSeatPoses(train.seating), train.seating);
    if (!seat) return;
    player.sit(seat, train.position.x, train.position.z, PLATFORM_Y);
    playerSeat = seat;
    hud.say(touchMode ? text.touch.seated : rebindText(text.seated), 3);
  }

  /**
   * The first minute: the first time the game starts moving, the player is
   * seated in a carriage rolling into a station (T-Centralen if a train is
   * on its way there), rather than standing on a platform. A dive from the
   * network view starts on the platform picked instead.
   */
  let staged = diveTo >= 0 || (debug && !params.has('stage'));
  /** While the first minute waits for SL's trains: until when (performance.now()). */
  let stageWaiting = 0;
  /** After continuing where the player was, said on the first resume. */
  let welcomeBack: string | null = null;
  function stageArrival(): void {
    if (welcomeBack) { hud.say(welcomeBack, 5); welcomeBack = null; }
    if (staged) return;
    // SL's trains take over as soon as the relay answers: wait a moment for them, or the seat would be on a timetable train about to hand over.
    if (realWanted && !lineLive[0] && !real.failed) {
      stageWaiting ||= performance.now() + STAGE_WAIT;
      if (performance.now() < stageWaiting) return;
    }
    // Still nothing from SL: the player has had the platform to themselves a while, so no seat.
    const waited = stageWaiting > 0 && !lineLive[0] && !real.failed;
    stageWaiting = 0;
    staged = true;
    if (waited || driving || saver.active || show.active) return;
    if (followClock) jumpTime(Date.now() / 1000 + (ghosts.clockOffset ?? 0) + loopOffset);
    if (!serviceOpen(time)) return;
    const best = arrivalTrain();
    if (!best) return;
    if (!seatAboard(best.svc.train, best.track)) return;
    hud.say(format(touchMode ? text.intro.aboardTouch : text.intro.aboard, { station: stationName(best.station) }), 10);
  }

  /** Sits the player down in a free seat facing the way the train runs on `track`, near the middle of the train. */
  function seatAboard(train: Train, track: 1 | 2): boolean {
    const forward = track === 1 ? -Math.PI / 2 : Math.PI / 2;
    const rank = (seat: Seat) => (Math.cos(seat.yaw - forward) > 0.9 ? 0 : 100) + Math.abs(seat.x);
    const occupied = occupiedSeatPoses(train.seating);
    const seat = cabinSeats(train.seating)
      .filter((c) => !occupied.some((p) => Math.abs(p.x - c.x) < 0.2 && Math.abs(p.z - c.z) < 0.2))
      .sort((a, b) => rank(a) - rank(b))[0];
    if (!seat) return false;
    player.sit(seat, train.position.x, train.position.z, train.position.y + PLATFORM_Y);
    playerSeat = seat;
    return true;
  }

  /** The same arrival is used to prepare its surroundings during loading and to seat the player on resume. */
  function arrivalTrain(): { svc: Service; station: number; track: 1 | 2; score: number } | null {
    let best: { svc: Service; station: number; track: 1 | 2; score: number } | null = null;
    for (const svc of services) {
      const st = svc.state;
      if (!svc.active || !st) continue;
      const stops = svc.timetable.stops;
      const moving = st.phase === 'moving';
      if (!moving && stops[st.stop].kind !== 'station') continue;
      const k = moving ? st.next : (st.stop + 1) % stops.length;
      const stop = stops[k];
      if (stop.kind !== 'station' || stop.terminal || svc.line !== 0) continue;
      const eta = svc.timetable.secondsUntil(svc.clock, k);
      if (eta < 12 || eta > 90) continue;
      const score = (stop.station === tCentralen ? 100 : net.stations[stop.station].branch ? 0 : 30) - Math.abs(eta - 30) - (moving ? 0 : 20);
      if (!best || score > best.score) best = { svc, station: stop.station, track: stop.track, score };
    }
    return best;
  }

  // A trip the player picked (`trip.ts`): from one station to another, guided along the way.
  let trip: TripGuide | null = null;
  /** When the trip's line leaves the status bar after arriving (game time). */
  let tripGone = 0;
  /**
   * The trip's first caption, said on its first tick with the game running: the clock stands still while paused, so a
   * wait counted before the game has caught up with it would be off by however long the menu was open.
   */
  let tripIntro: { waiting: boolean } | null = null;
  /** The next train that takes a leg, standing at its first station or at most two minutes from it, coming from the station before. */
  function legTrain(leg: Leg): Service | null {
    let best: { svc: Service; eta: number } | null = null;
    for (const svc of services) {
      const st = svc.state;
      if (!svc.active || !st || !leg.routes.includes(svc.route)) continue;
      const tt = svc.timetable;
      const k = tt.stopIndex(leg.from, leg.track);
      if (k < 0) continue;
      let eta: number;
      if (st.phase !== 'moving' && st.stop === k) eta = 0;
      else if (st.phase === 'moving' && st.next === k && tt.stops[st.stop].kind === 'station') eta = tt.secondsUntil(svc.clock, k);
      else continue;
      if (eta < 120 && (!best || eta < best.eta)) best = { svc, eta };
    }
    return best?.svc ?? null;
  }
  /**
   * When the next train that takes a leg comes to its first station, as the platform boards count: SL's departures
   * where SL drives the line, else the timetable's arrivals. Only trains of the leg's routes count. Null if none soon.
   */
  function legWait(leg: Leg): Wait | null {
    const at = (seconds: number): Wait => ({ seconds, clock: formatClock(time + seconds) });
    if (lineLive[leg.line]) {
      const numbers = new Set(leg.routes.map((r) => net.routes[r].number));
      const next = real.schedules[leg.line].nextDepartures(leg.from, leg.track, time, 6).find((d) => numbers.has(d.journey.line) && d.departs <= 60 * 60);
      if (!next) return null;
      // As the board says it: "Nu" from half a minute before (`updateRealDepartures`).
      const seconds = realArrival(next.journey, next.departs, leg.from, leg.track);
      return at(seconds < 30 ? 0 : seconds);
    }
    const next = operations.nextArrivals(time, leg.from, leg.track, 6, undefined, leg.line).find((a) => leg.routes.includes(operations.routeOf(a.service)));
    return next ? at(next.eta) : null;
  }
  /** On a leg's first platform, by the track its trains leave from, facing it. */
  function legPlatform(leg: Leg): { feet: Vector3; yaw: number } {
    const s = world.stations[leg.from];
    const track = s.platformTracks.find((t) => t.line === leg.line && t.track === leg.track) ?? s.platformTracks.find((t) => t.track === leg.track);
    if (!track) return { feet: s.spawn.clone(), yaw: s.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2 };
    // The island beside the track, at its height.
    const island = s.platforms.reduce((a, b) => (Math.abs(b - track.z) < Math.abs(a - track.z) ? b : a));
    const z = track.z + Math.sign(island - track.z) * (TRACK_Z - 2.2);
    const travel = leg.track === 1 ? 1 : -1;
    return { feet: new Vector3(s.cx - s.exitDir * 20, PLATFORM_Y + track.y, z), yaw: Math.atan2(travel * 0.55, -Math.sign(track.z - z) * 0.84) };
  }
  function startTrip(from: string, to: string): void {
    const plan = planTrip(net, from, to);
    if (!plan || driving || saver.active || show.active || life || respawning) return;
    trip = new TripGuide(net, plan);
    tripGone = 0;
    staged = true;
    const leg = plan.legs[0];
    const here = world.locate(player.feet);
    // Already there, on foot: the guide takes it from here.
    if (!riding && here.station !== null && stationName(here.station) === from) {
      tripIntro = { waiting: true };
      updateTrip();
      return;
    }
    respawning = true;
    void hud.blackout(() => {
      if (player.seated) player.stand();
      const svc = legTrain(leg);
      if (svc) world.ensureBuilt(svc.train.position.x);
      const seated = !!svc && seatAboard(svc.train, leg.track);
      if (!seated) {
        const at = legPlatform(leg);
        world.ensureBuilt(at.feet.x);
        player.teleport(at.feet, at.yaw);
      }
      tripIntro = { waiting: !seated };
    }).then(() => { respawning = false; updateTrip(); });
  }
  function stopTrip(): void {
    trip = null;
    tripIntro = null;
    hud.setTrip(null);
  }
  /** Once a second: where the player is on the trip, and what to do next. */
  function updateTrip(): void {
    // Not while the view cuts to the trip's start (the platform left behind is not a stop on the way), nor paused.
    if (!trip || respawning || paused) return;
    if (tripIntro) {
      // The way, and on foot how long until the next train that takes it.
      const wait = tripIntro.waiting ? legWait(trip.current) : null;
      const start = format(text.trip.start, { station: trip.trip.to, way: tripSummary(net, trip.trip) });
      hud.say(wait ? `${start} ${format(text.trip.nextTrain, { when: waitText(wait) })}` : start, 9);
      tripIntro = null;
    }
    if (trip.done) {
      if (time > tripGone) stopTrip();
      return;
    }
    const svc = riding ? services.find((s) => s.train === riding && s.active && s.state) : undefined;
    let aboard: TripView['aboard'] = null;
    if (svc?.state) {
      const st = svc.state;
      const stops = svc.timetable.stops;
      const standing = st.phase !== 'moving' && stops[st.stop].kind === 'station';
      const ahead: number[] = [];
      for (let n = 0, k = st.phase === 'moving' ? st.next : st.stop + 1; n < stops.length; n++, k++) {
        const stop = stops[k % stops.length];
        if (stop.kind !== 'station') break;
        ahead.push(stop.station);
        if (stop.terminal) break;
      }
      aboard = { train: svc.train.id, at: standing ? stops[st.stop].station : null, ahead };
    }
    const here = world.locate(player.feet);
    const update = trip.step({ aboard, elsewhere: !!riding && !svc, station: here.station, platform: here.area === 'platform' && !here.label, wait: riding ? null : legWait(trip.current) });
    hud.setTrip(update.status);
    if (update.say) hud.say(update.say, 7);
    if (update.done) tripGone = time + 8;
  }
  hud.onTrip = (from, to) => {
    // Not the first minute's seat on another train first.
    staged = true;
    resume();
    startTrip(from, to);
  };
  hud.onTripCancel = () => stopTrip();

  function climb(): void {
    const spot = world.canClimb(player.feet);
    if (!spot) return;
    player.teleport(new Vector3(player.feet.x, spot.y + 0.05, spot.z));
  }

  function use(): void {
    const it = world.interactableNear(player.feet);
    if (!it) return;
    const message = it.act();
    if (message) hud.say(message, Math.max(4, message.length / 14));
  }

  function respawn(message: string): void {
    if (respawning) return;
    respawning = true;
    void hud
      .blackout(() => {
        const s = world.nearestStation(player.feet.x);
        player.teleport(s.spawn, s.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2);
        hud.say(message, 6);
      })
      .then(() => (respawning = false));
  }

  function startDriving(): void {
    if (driving || respawning) return;
    const nearest = driverRoute.reduce((a, b) => (Math.abs(world.stationX[b] - player.feet.x) < Math.abs(world.stationX[a] - player.feet.x) ? b : a));
    respawning = true;
    void hud.blackout(() => {
      driving = true;
      audio.cancelAnnouncement();
      for (const s of services) { s.active = false; s.train.setActive(false); }
      silverTrain.setActive(false);
      driver.start(driverRoute.indexOf(nearest));
      player.teleport(driver.seatFeet, driver.heading > 0 ? -Math.PI / 2 : Math.PI / 2);
      player.driveEye = driver.eye;
      touch?.setDriving(true);
      hud.setDriverButton(true);
      hud.say(touchMode ? text.driver.introTouch : text.driver.intro, 9);
    }).then(() => (respawning = false));
  }

  function stopDriving(): void {
    if (!driving) return;
    respawning = true;
    void hud.blackout(() => {
      driving = false;
      player.driveEye = null;
      const at = driver.platformStation;
      const station = at !== null ? world.stations[driverRoute[at]] : world.nearestStation(driver.train.position.x);
      driver.stop();
      hud.setDriver(null);
      touch?.setDriving(false);
      hud.setDriverButton(false);
      player.teleport(station.spawn, station.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2);
    }).then(() => (respawning = false));
  }

  /** Keeps the player from being trapped in a closing doorway. */
  function clearDoorway(train: Train): void {
    if (train.doorsOpen <= 0 || train.doorsOpen > 0.7) return;
    const lx = player.feet.x - train.position.x;
    const lz = player.feet.z - train.position.z;
    const side = train.openSide;
    if (Math.sign(lz) !== side || Math.abs(lz) < TRAIN_HALF_W - 0.45 || Math.abs(lz) > TRAIN_HALF_W + 0.45) return;
    // Measured from the train's own rails: at a two-level station the lower one's lie under the other's.
    const up = player.feet.y - train.position.y;
    if (up < PLATFORM_Y - 0.3 || up > PLATFORM_Y + 0.5) return;
    if (!train.stock.doors.some((d) => Math.abs(lx - d) < DOOR_HALF_W + 0.35)) return;
    const inside = Math.abs(lz) < TRAIN_HALF_W;
    const nz = train.position.z + side * (inside ? TRAIN_HALF_W - 0.5 : TRAIN_HALF_W + 0.5);
    player.teleport(new Vector3(player.feet.x, player.feet.y + 0.02, nz));
  }

  /** Silverpilen's next pass through a station's cave on track 1, in seconds, if within a minute. */
  function silverApproach(cx: number): number | null {
    for (let dt = 0; dt <= 60; dt += 2) {
      const s = lineLive[0] ? realSilver.peek(dt) : silver.stateAt(time + dt);
      if (s && Math.abs(s.x - cx) < 80) return dt;
    }
    return null;
  }

  let departuresTimer = 0;
  let warmedLine = -1;
  let flicker = false;
  /** The board header takes turns: the last trains, then each of SL's messages for the station and SMHI's warnings, six seconds each. */
  /** The year on the boards while a life on the blue line plays. */
  let lifeYear: number | null = null;
  function banner(station: number, lastTrain?: string): string | undefined {
    if (lifeYear !== null) return String(lifeYear);
    const texts = [...(lastTrain ? [lastTrain] : []), ...forStation(disruptions.active, net.stations[station].name).map((d) => d.header), ...warnings.notices.map((d) => d.header)];
    return texts.length ? texts[Math.floor(time / 6) % texts.length] : undefined;
  }
  /** The last train before the night break at each station and track, cached for a minute. */
  const lastTrains = new Map<string, { at: number; value: number | null }>();
  function lastTrainAt(station: number, track: 1 | 2): number | null {
    const key = `${station}:${track}`;
    let cached = lastTrains.get(key);
    if (!cached || Math.abs(time - cached.at) > 60 || (cached.value !== null && time > cached.value)) {
      const eta = operations.lastArrival(time, station, track, 5 * 3600);
      cached = { at: time, value: eta === null ? null : time + eta };
      lastTrains.set(key, cached);
    }
    return cached.value;
  }
  function updateDepartures(): void {
    flicker = !flicker;
    const open = serviceOpen(time);
    for (const s of world.stations) {
      // Only the stations near the player need fresh boards; the rest update when they come into view.
      if (Math.abs(s.cx - player.feet.x) > 1500) continue;
      // Each track as its line runs: SL's departures where SL drives it, the timetable's elsewhere, as its trains do.
      const live = s.platformTracks.map((pt) => lineLive[pt.line]);
      if (live.every(Boolean)) { updateRealDepartures(s); continue; }
      const mixed = live.some(Boolean);
      // Each track's next two trains, as the boards over the platform list them.
      const arrivals = s.platformTracks.map((pt, i) => ({ pt, track: pt.track, number: pt.number, live: live[i],
        next: live[i] ? [] : operations.nextArrivals(time, s.index, pt.track, BOARD_ROWS, undefined, s.platforms.length > 1 ? pt.line : undefined) }));
      const soonest = Math.min(...arrivals.filter((a) => !a.live).map(({ next }) => next[0]?.eta ?? Infinity));
      // The night's notice and the last trains are the timetable's: only where no line follows SL.
      if (!mixed && !open && soonest > 15 * 60) {
        s.setDepartures([], { title: text.clock.lastTrainGone, detail: Number.isFinite(soonest) ? `${text.clock.firstTrain} ${formatClock(time + soonest)}` : '' });
        continue;
      }
      const rows: DepartureRow[] = arrivals.flatMap(({ pt, track, number, next, live: sl }) => {
        if (sl) return realRows(s, pt);
        if (!next.length) return [{ track: number, line: '', destination: text.clock.lastTrainGone, eta: '' }];
        // A train that ends its run here takes no one further: one row says so.
        const tt = operations.timetableOf(next[0].service);
        if (tt.stops[tt.stopIndex(s.index, track)].terminal) return [{ track: number, line: '', destination: 'Slutstation', eta: boardEta(next[0].eta) }];
        return next.map((a) => {
          const destination = serviceDestination(net, operations.routeOf(a.service), track);
          return { track: number, line: destination.number, destination: a.last ? `${destination.name} · ${text.clock.lastTrain}` : destination.name, eta: boardEta(a.eta) };
        });
      });
      // A board glitches just before Silverpilen passes.
      const ghost = silverApproach(s.cx);
      if (ghost !== null && flicker) rows[0] = { track: rows[0]?.track ?? 1, line: '', destination: text.silverpilen.destination, eta: ghost < 20 ? 'Nu' : '' };
      // In the evening the boards say when the last trains leave.
      const hours = stockholm(time).hours;
      let lastTrain: string | undefined;
      if (!mixed && open && (hours >= 21 || hours < 1)) {
        const last = arrivals.map(({ track }) => lastTrainAt(s.index, track));
        if (last.every((t) => t !== null)) lastTrain = format(text.clock.lastTrainAt, { times: last.map((t) => formatClock(t!)).join(' · ') });
      }
      s.setDepartures(rows, null, banner(s.index, lastTrain));
    }
  }

  /**
   * Seconds until a real journey's train is in at a station, as its board counts: SL's departure, but none once the
   * train stands there (it waits at the platform for that departure) or is moments from it.
   */
  function realArrival(journey: Journey, departs: number, station: number, track: 1 | 2): number {
    const svc = services.find((v) => v.active && v.state && v.journey?.id === journey.id);
    if (!svc?.state) return departs;
    const k = svc.timetable.stopIndex(station, track);
    const st = svc.state;
    if (k < 0) return departs;
    if (st.phase !== 'moving' && st.stop === k) return 0;
    if (st.phase === 'moving' && st.next === k) return Math.min(departs, svc.timetable.secondsUntil(svc.clock, k) / Math.max(0.1, svc.rate));
    return departs;
  }

  /** Boards in real mode show SL's own countdown to departure, for each line's platforms, and "Nu" once the train is in. */
  function updateRealDepartures(s: (typeof world.stations)[number]): void {
    s.setDepartures(s.platformTracks.flatMap((pt) => realRows(s, pt)), null, banner(s.index));
  }

  /** One track's rows from SL, on a line SL drives. */
  function realRows(s: (typeof world.stations)[number], pt: (typeof s.platformTracks)[number]): DepartureRow[] {
    const next = real.schedules[pt.line].nextDepartures(s.index, pt.track, time, BOARD_ROWS).filter((d) => d.departs <= 60 * 60);
    if (!next.length) return [{ track: pt.number, line: '', destination: text.real.noTrains, eta: '' }];
    const eta = (d: (typeof next)[number]) => boardEta(realArrival(d.journey, d.departs, s.index, pt.track), 30);
    if (isLineTerminal(net, s.index, pt.track)) return [{ track: pt.number, line: '', destination: 'Slutstation', eta: eta(next[0]) }];
    return next.map((d) => ({ track: pt.number, line: d.journey.line, destination: d.journey.destination, eta: eta(d) }));
  }

  /** A countdown as the boards show it: "Nu" once the train is in, minutes, or the clock time for one far off. */
  function boardEta(seconds: number, now = 20): string {
    return seconds < now ? 'Nu' : seconds > 45 * 60 ? formatClock(time + seconds) : `${Math.ceil(seconds / 60)} min`;
  }

  /**
   * The line the player is on: the train's when riding; on a platform two lines share, the one on the nearest track;
   * otherwise the nearest station's (a shared station belongs to its first line, so that alone would name red for green).
   */
  function lineHere(): number {
    const svc = riding ? services.find((s) => s.train === riding) : undefined;
    if (svc) return svc.line;
    const st = world.nearestStation(player.feet.x);
    const tracks = st.platformTracks;
    if (tracks.length > 2 && Math.abs(st.cx - player.feet.x) < PLATFORM_HALF_L) {
      return tracks.reduce((best, t) => (Math.abs(t.z - player.feet.z) < Math.abs(best.z - player.feet.z) ? t : best)).line;
    }
    return net.stations[st.index].line;
  }

  /** Which way a train's doors open: toward the platform it stands at (a shared station has two). */
  function doorSide(stop: { kind: string; station: number }, z: number): 1 | -1 {
    if (stop.kind !== 'station') return z > 0 ? -1 : 1;
    const zc = world.stations[stop.station].platforms.reduce((best, p) => (Math.abs(p - z) < Math.abs(best - z) ? p : best));
    return zc > z ? 1 : -1;
  }

  /** Moves all timetable trains to the current time, marking who is in service. */
  function updateTrains(allowChime: boolean): void {
    for (const svc of services) {
      let active: boolean;
      if (lineLive[svc.line]) {
        const c = real.schedules[svc.line].slot(svc.slot, time);
        active = c !== null;
        svc.journey = c?.journey ?? null;
        if (c) { svc.clock = c.clock; svc.rate = c.rate; svc.route = routeIndex(c.journey.line); svc.timetable = lineServices[svc.line].timetables[c.route]; }
      } else {
        // After an emergency stop the train runs late until it can catch up, out of sight in a turnback.
        if (svc.brake && time >= svc.brake.arrive) {
          svc.delay = svc.offset - svc.brake.lag;
          svc.brake = null;
        }
        // A power cut holds every train where it stands (`powerCut.ts`), the same for everyone.
        svc.clock = (svc.brake ? time : cutClock(time)) + svc.offset - (svc.brake ? svc.offset - svc.brake.lag : svc.delay);
        svc.rate = svc.brake ? 1 : cutRate(time);
        svc.route = operations.routeOf(svc.index);
        svc.timetable = operations.timetableOf(svc.index);
        svc.journey = null;
        active = operations.inService(time, svc.index);
      }
      active &&= !driving;
      const st = stateOf(svc);
      const turning = svc.timetable.stops[st.stop].kind === 'turnback' && st.phase === 'waiting';
      if (svc.delay && !svc.brake && turning && Math.abs(st.x - player.feet.x) > 300 && riding !== svc.train) svc.delay = 0;
      const prev = svc.state?.phase ?? null;
      const changed = !svc.state || svc.state.phase !== st.phase || svc.state.stop !== st.stop;
      svc.state = st;
      svc.active = active;
      const tr = svc.train;
      tr.setActive(active);
      if (!active) { tr.place(st.x, st.z, st.y); continue; }
      tr.setNear(tr === riding || Math.abs(st.x - player.feet.x) < 400);
      tr.setInteriorShown(tr === riding || Math.abs(st.x - player.feet.x) < INTERIOR_REACH);
      tr.setPose(st.x, st.z, st.y);
      const stop = svc.timetable.stops[st.phase === 'moving' ? st.next : st.stop];
      tr.setHeading(stop.track === 1 ? 1 : -1);
      tr.setDoors(st.doors, doorSide(svc.timetable.stops[st.stop], st.z));
      tr.setDestination(...trainSigns(st, svc));
      tr.setInfo(infoText(st, svc));
      if (allowChime && changed && prev !== null && st.phase === 'closing' && listening && !document.hidden) {
        const location = world.locate(player.feet);
        const stoppedAt = svc.timetable.stops[st.stop];
        const onThisPlatform = !riding && location.station === stoppedAt.station && (location.area === 'platform' || location.area === 'track');
        audio.chime(riding === tr ? 1 : onThisPlatform ? 0.6 : 0);
      }
      clearDoorway(tr);
    }
  }

  function updateExpress(): void {
    const st = driving || realOn ? null : express.stateAt(time);
    expressState = st;
    expressTrain.setActive(st !== null);
    if (!st) return;
    expressTrain.setPose(st.x, st.z);
    expressTrain.setHeading(st.dir);
    expressTrain.setDoors(0, st.z > 0 ? -1 : 1);
  }

  function updateSilver(): void {
    let st: SilverState | null = null;
    if (driving) st = null;
    else if (lineLive[0]) {
      rivals.length = 0;
      for (const s of services) if (s.line === 0 && s.active) rivals.push(s.train.position);
      st = realSilver.update(time, rivals);
    } else st = silver.stateAt(time);
    silverState = st;
    silverTrain.setActive(st !== null && st.opacity > 0.01);
    if (!st) return;
    silverTrain.setPose(st.x, st.z);
    silverTrain.setDoors(st.doors, st.z > 0 ? -1 : 1);
    silverTrain.setOpacity(st.opacity);
    // A cabin lit by tired fluorescent tubes.
    const buzz = Math.sin(time * 37) > 0.93 || Math.sin(time * 3.1 + Math.sin(time * 0.7) * 4) > 0.985;
    silverTrain.setInteriorLight((buzz ? 0.25 : 0.62) * st.opacity);
    (silverRiders.material as MeshBasicMaterial).opacity = 0.3 * st.opacity;
  }

  /** Hands lines' trains between the timetable and SL. A rider on a line that changes is set down on the nearest platform first. */
  function switchTrains(live: boolean[]): void {
    const changed = live.map((on, li) => on !== lineLive[li]);
    const wasOn = realOn;
    const underFeet = trainUnderFeet();
    const aboard = services.some((s) => changed[s.line] && s.train === underFeet);
    if (live[0] && !lineLive[0]) realSilver.adopt(time);
    lineLive = live;
    realOn = live.some(Boolean);
    updateTrains(false);
    for (const s of services) if (changed[s.line]) s.train.place(s.train.position.x, s.train.position.z, s.train.position.y - s.train.baseY);
    if (realOn !== wasOn) hud.say(realOn ? text.real.on : realWanted ? text.real.failed : text.real.off, 5);
    if (aboard && !respawning) {
      respawning = true;
      void hud.blackout(() => {
        const s = world.nearestStation(Math.max(world.stationX[0], Math.min(world.stationX[world.stationX.length - 1], player.feet.x)));
        player.teleport(s.spawn, s.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2);
        hud.say(text.real.moved, 4);
      }).then(() => (respawning = false));
    }
  }

  /** Changes game time in one step (after a pause, or when the shared clock disagrees), keeping riders aboard. */
  function jumpTime(to: number): void {
    const carrier = riding && riding !== driver.train ? riding : null;
    const local = carrier ? player.feet.clone().sub(carrier.position) : null;
    time = to;
    updateTrains(false);
    updateSilver();
    for (const s of services) s.train.place(s.train.position.x, s.train.position.z, s.train.position.y - s.train.baseY);
    if (carrier && local && carrier.isActive) player.teleport(carrier.position.clone().add(local));
  }

  /**
   * The time loop: seconds added to the wall clock for this player alone,
   * after riding Silverpilen past Kymlinge. Everyone else is still in the
   * present, so the other players' ghosts and SL's real trains are hidden.
   */
  let loopOffset = 0;
  function timeLoop(): void {
    respawning = true;
    void hud.blackout(() => {
      const c = stockholm(time);
      let wake = stockholmEpoch(c.year, c.month, c.day, 4, 59, 20);
      if (wake <= time + 60) {
        const next = new Date(Date.UTC(c.year, c.month - 1, c.day + 1));
        wake = stockholmEpoch(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 4, 59, 20);
      }
      loopOffset += wake - time;
      jumpTime(wake);
      const s = world.stations[0];
      player.teleport(new Vector3(s.cx + 9, PLATFORM_Y, 0.8), -Math.PI / 2);
      player.pitch = -0.1;
      if (ghostsOn) ghosts.setEnabled(false);
      if (realWanted) { realWanted = false; real.setEnabled(false); hud.setOption(hud.realButton, false); }
      hud.loopButton.hidden = false;
      hud.say(text.loop.wake, 9);
    }).then(() => (respawning = false));
  }
  function wakeUp(): void {
    if (!loopOffset) return;
    loopOffset = 0;
    jumpTime(Date.now() / 1000 + (ghosts.clockOffset ?? 0));
    if (ghostsOn) ghosts.setEnabled(ghosts.available);
    hud.loopButton.hidden = true;
    hud.say(text.loop.back, 5);
  }
  hud.loopButton.addEventListener('click', (event) => { event.stopPropagation(); wakeUp(); resume(); });

  let escalatorTime = 0;
  let last = performance.now();
  /** The anonymous performance report, once the game is up (`telemetry.ts`). */
  let telemetry: Telemetry | null = null;
  const escVel = new Vector3();
  let nightCaption = '';

  /** Debug: a fixed step for frames run by hand (`__us.step`), which also run while the page is hidden. */
  let manualDt: number | null = null;
  /** How far away a station clock is still redrawn every second. The camera sees 185 m. */
  const CLOCK_REACH = 300;

  /** In debug, how long each part of the frame takes, summed over frames, for `__us.laps()`. */
  const laps = new Map<string, number>();
  /** This frame's parts, and the slowest frames' kept for `__us.slowFrames()`. */
  const frameLaps: Array<[string, number]> = [];
  const slowLog: Array<{ at: number; ms: number; parts: Record<string, number>; where: string }> = [];
  let lapAt = 0;
  const lap = debug ? (name: string) => {
    const t = performance.now();
    laps.set(name, (laps.get(name) ?? 0) + t - lapAt);
    frameLaps.push([name, t - lapAt]);
    lapAt = t;
  } : () => {};
  function frame(): void {
    const now = performance.now();
    lapAt = now;
    frameLaps.length = 0;
    const dt = manualDt ?? Math.min((now - last) / 1000, 1 / 20);
    const frameMs = now - last;
    last = now;
    if (document.hidden && manualDt === null) return;
    pads.poll(dt, !paused && player.enabled && !saver.active && !show.active, driving);
    if (paused) {
      if (renderNeeded) {
        renderer.render(scene, player.camera);
        renderNeeded = false;
      }
      return;
    }
    if (manualDt === null) {
      resolution.heldMs = settings.value.battery ? 1000 / FPS_BATTERY : 0;
      if (resolution.frame(frameMs, workMs, now)) {
        resize();
        // At the lowest notch the machine is struggling: say once that battery saver makes it lighter.
        if (resolution.level === RENDER_SCALES.length - 1 && !settings.value.battery && !batteryTold) {
          batteryTold = true;
          hud.tip(text.battery.tip, 8);
        }
      }
      telemetry?.frame(frameMs, workMs, settings.value.battery);
    }
    if (!freezeTimetable) time += dt;
    if (followClock || (realOn && !fixedClock)) {
      // Follow the wall clock (or the shared relay clock): slew gently, jump if far off.
      const target = Date.now() / 1000 + (ghosts.clockOffset ?? 0) + loopOffset + showOffset;
      const error = target - time;
      if (Math.abs(error) > CLOCK_JUMP) jumpTime(target);
      else time += Math.max(-0.05 * dt, Math.min(0.05 * dt, error));
    }

    // Real trains take over (or hand back) line by line, once SL has answered for it, or when its data goes stale.
    if (realWanted) for (const schedule of real.schedules) schedule.update(time);
    const wantLive = net.lines.map((_, li) => realWanted && real.live(li));
    if (wantLive.some((on, li) => on !== lineLive[li])) switchTrains(wantLive);
    if (stageWaiting) stageArrival();
    if (realWanted && !realOn && real.failed && !realFailShown) {
      realFailShown = true;
      hud.say(text.real.failed, 6);
    }

    // Who is the player riding, judged before the trains move this frame?
    riding = trainUnderFeet();
    const wasRiding = riding;

    updateTrains(true);
    updateSilver();
    updateExpress();
    if (driving) driver.update(dt);
    lap('trains');

    // A train that goes out of service, or a real one at the end of its run, sets its riders down at the nearest terminal.
    if (wasRiding && !wasRiding.isActive && !respawning) {
      respawning = true;
      void hud.blackout(() => {
        const s = world.nearestStation(wasRiding.position.x);
        player.teleport(s.spawn, s.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2);
        hud.say(text.clock.depot, 6);
      }).then(() => (respawning = false));
    }

    physics.step(dt);
    lap('physics');
    if (riding && riding.isActive) player.carry(riding.delta);
    player.carry(world.escalatorVelocity(player.feet, escVel).multiplyScalar(dt));
    player.carry(world.inclines(time, player.feet));
    const belt = world.travelatorVelocity(player.feet);
    if (belt) player.carry(escVel.set(0, 0, belt * dt));
    const rideService = services.find((s) => s.train === riding);
    const rideState = rideService?.state;
    let rideAcceleration = rideService && rideState ? (stateOf(rideService, 0.1).speed - rideState.speed) / 0.1 * (rideService.timetable.stops[rideState.stop].track === 1 ? 1 : -1) : 0;
    let rideDistance = rideState?.u ?? 0;
    let rideSpeed = rideState?.speed ?? 0;
    if (riding === driver.train) ({ distance: rideDistance, speed: rideSpeed, acceleration: rideAcceleration } = driver.state);
    if (riding === silverTrain && silverState) { rideDistance = silverState.u; rideSpeed = silverState.speed; }
    if (!riding && player.seated) player.stand();
    saver.update(dt);
    show.update(dt);
    updateLife(dt);
    showMusic?.update();
    player.setRide(rideDistance, rideSpeed, rideAcceleration, motion && riding !== null);
    player.update(dt);
    // On foot, the Hjulsta side of the junction tunnel leads back into the Akalla side (see `World.junctionWalk`).
    const crossing = !riding && !driving ? world.junctionWalk(player.feet) : null;
    if (crossing) player.teleport(player.feet.clone().add(new Vector3(crossing.dx, 0, crossing.dz)));
    // Past the middle of a walkway between two lines' stations, on into the other's copy of it.
    const across = !riding && !driving ? world.walkwayCross(player.feet) : null;
    if (across) {
      const pitch = player.pitch;
      player.teleport(across.to, player.yaw + across.turn);
      player.pitch = pitch;
      const there = world.nearestStation(across.to.x);
      if (there.name === 'T-Centralen' && net.stations[there.index].line !== 0) hud.say(text.transfer.arrived, 4);
    }
    lap('player');
    // Whatever lies close by must be built now, even after a teleport; a little further off, a few ms at a time.
    world.keepUp(player.feet.x, 6, !riding && !driving ? world.walkwayAhead(player.feet) : null);
    lap('build');
    crowd.update(dt, player.feet.x, services.map((s) => (s.active && s.state ? { time: s.clock, state: s.state, timetable: s.timetable } : null)));
    escalatorLife.update(dt, world.stations.map((s) => s.escalator), player.feet, people, world.escalatorsRunning, escalatorBusy, listening ? audio.output : null, era.past);
    cabin.update(dt, services.map((s) => {
      if (!s.active || !s.state) return null;
      const heading = s.timetable.stops[s.state.phase === 'moving' ? s.state.next : s.state.stop].track === 1 ? 1 : -1;
      return (stateOf(s, 0.1).speed - s.state.speed) / 0.1 * heading;
    }));
    lap('crowd');
    // Re-evaluate the listener after movement, so boarding or leaving cancels the old voice.
    riding = trainUnderFeet();
    const listenerLocation = world.locate(player.feet);
    const availableSeat = !driving && riding && Math.abs(player.feet.y - PLATFORM_Y) < 0.2 && nearestSeat(player.feet.x - riding.position.x, player.feet.z - riding.position.z, occupiedSeatPoses(riding.seating), riding.seating);
    brakeHandle.pos.copy(player.feet).y += 1;
    // The driver's messages while the train stands.
    const braked = services.find((s) => s.brake && s.train === riding);
    if (braked?.brake) {
      const b = braked.brake;
      const key = String(b.time);
      if (b.standing(time) && time - b.time > 5 && !brakeTalk.has(`${key}:1`)) {
        brakeTalk.add(`${key}:1`);
        audio.announce(text.brake.driver, () => hud.say(text.brake.driver, 9), () => {}, true);
      }
      if (b.standing(time) && b.arrive - time < 45 && !brakeTalk.has(`${key}:2`)) {
        brakeTalk.add(`${key}:2`);
        audio.announce(text.brake.onward, () => hud.say(text.brake.onward, 6), () => {}, true);
      }
    }
    const usable = driving ? null : world.interactableNear(player.feet);
    const climbable = !driving && !!world.canClimb(player.feet);
    touch?.setContext(player.seated, !!availableSeat, climbable, !!usable);
    const prompt = usable ? (typeof usable.prompt === 'function' ? usable.prompt() : usable.prompt) : '';
    const usablePrompt = usable ? (touchMode ? prompt.replace(/^E · /, '') : rebindPrompt(prompt)) : null;
    hud.setInteraction(driving ? null : usable?.urgent ? usablePrompt : player.seated ? (touchMode ? text.touch.standHint : rebindPrompt(text.standHint)) : availableSeat ? (touchMode ? text.touch.seatHint : rebindPrompt(text.seatHint)) : usable && !climbable ? usablePrompt : null);
    if (!driving && !saver.active && !show.active && !respawning) {
      if (availableSeat && !player.seated) tips.offer('sit', format(text.hints.sit, { key: controlName('sit') }));
      else if (usable && !climbable) tips.offer('use', format(text.hints.use, { key: controlName('use') }));
      playedFor += dt;
      if (playedFor > 25 && !tips.has('pause')) tips.offer('pause', pads.active ? text.hints.padPause : touchMode ? text.hints.touchPause : format(text.hints.pause, { key: 'Esc' }));
    }
    const regular = services.filter((s) => s.active && s.state);
    const candidate = listening && !document.hidden && !respawning && !driving ? announcementAt(net,
      regular.map((service) => ({ id: service.train.id, time: service.clock, state: service.state!, timetable: service.timetable })),
      { trainId: riding?.id ?? null, station: listenerLocation.station, onPlatform: listenerLocation.area === 'platform' || listenerLocation.area === 'track' },
      disruptions.traffic[0] ?? warnings.notices[0] ?? null,
    ) : null;
    const notice = announcements.update(candidate);
    if (notice.changed) {
      if (notice.event) {
        const message = notice.event.text;
        const caption = notice.event.caption ?? message;
        const captionDuration = notice.event.recording ? RECORDED_ANNOUNCEMENTS[notice.event.recording].duration + Math.max(6, message.length / 12) : Math.max(6, message.length / 12);
        audio.announce(message, () => hud.say(caption, captionDuration), () => {
          hud.clearCaption(caption);
        }, notice.event.signal, notice.event.recording,
        notice.event.alightingWarning ? () => hud.clearCaption(caption) : undefined);
      } else audio.cancelAnnouncement();
    }

    lap('announcements');
    if (world.escalatorsRunning) escalatorTime += dt;
    world.updateEscalators(escalatorTime, player.feet.x);
    world.update(dt, time, player.feet.x);

    lap('escalators');
    // Silverpilen: a sighting, a whisper aboard, and what happens at the end of the line.
    if (silverState && listening) {
      const run = String(silverState.run);
      const here = world.locate(player.feet);
      if (riding !== silverTrain && here.station !== null && (here.area === 'platform' || here.area === 'track') && Math.abs(silverState.x - player.feet.x) < 90 && !silverSeen.has(`seen:${run}`)) {
        silverSeen.add(`seen:${run}`);
        hud.say(silverState.phase === 'moving' ? text.silverpilen.sighted : text.silverpilen.standing, 6);
      }
      if (riding === silverTrain && silverState.phase === 'moving' && silverState.at === null && silverState.x > world.stationX[silverState.stopStation] && !silverSeen.has(`whisper:${run}`)) {
        silverSeen.add(`whisper:${run}`);
        audio.whisper(text.silverpilen.whisper);
        hud.say(text.silverpilen.whisper, 4);
      }
      if (riding !== silverTrain && silverTrain.hits(player.feet) && !silverSeen.has(`through:${run}`)) {
        silverSeen.add(`through:${run}`);
        hud.say(text.silverpilen.through, 6);
      }
      // Stay aboard past Kymlinge and you wake up at Kungsträdgården at five in the morning.
      if (riding === silverTrain && silverState.opacity < 0.4 && !respawning) timeLoop();
    }

    // Hazards.
    const here = world.locate(player.feet);
    if (player.feet.y < FALL_Y) respawn('Du föll. Tillbaka på perrongen.');
    if (services.some((s) => s.active && s.train.hits(player.feet)) || (expressState && expressTrain.hits(player.feet))) {
      respawn('Du blev påkörd. Håll dig borta från spåret.');
    }
    const onTrack = !riding && !driving && player.feet.y < PLATFORM_Y - 0.3 && (here.area === 'track' || here.area === 'tunnel');
    if (onTrack) {
      hud.setWarning(world.canClimb(player.feet) ? (touchMode ? text.touch.trackWarning : rebindText(text.trackWarning)) : text.area.forbidden);
    } else {
      hud.setWarning(null);
    }

    // Status bar.
    const areaLabel = { platform: '', track: text.area.track, escalator: text.area.escalator, hall: text.area.hall, street: text.area.street, tunnel: text.area.tunnel, service: text.service.corridor, transfer: text.transfer.area };
    if (driving) {
      const r = driver.readout();
      hud.setStatus(text.driver.title, r.next ? `${text.driver.next}: ${r.next}` : line.name);
      hud.setDriver(r);
    } else if (riding === silverTrain) {
      hud.setStatus(text.silverpilen.name, text.silverpilen.status);
    } else if (riding) {
      const svc = services.find((s) => s.train === riding);
      if (svc?.state) hud.setStatus(infoText(svc.state, svc), destinationText(svc.state, svc));
    } else if (here.station !== null) {
      hud.setStatus(stationName(here.station), here.label ? inLanguage(here.label) : areaLabel[here.area]);
    } else if (here.label) {
      hud.setStatus(inLanguage(here.label), here.area === 'platform' ? text.kymlinge.neverOpened : areaLabel[here.area]);
    } else {
      hud.setStatus(world.outdoorAt(player.feet) > 0.5 ? text.area.track : text.area.tunnel, net.lines[lineHere()].name);
    }

    lap('hazards');
    // Sound: the loudest train decides the rumble. Silverpilen makes none.
    let loud = 0;
    let speed = 0;
    let dominant: { id: number; distance: number; speed: number; braking: number } | null = null;
    const sounding = regular.map((s) => ({ train: s.train, speed: s.state!.speed, distance: s.state!.u, braking: (s.state!.speed - stateOf(s, 0.1).speed) / 0.1 }));
    if (driving) sounding.push({ train: driver.train, speed: driver.state.speed, distance: driver.state.distance, braking: Math.max(0, -driver.state.acceleration) });
    if (expressState) sounding.push({ train: expressTrain, speed: expressState.speed, distance: expressState.x * expressState.dir, braking: 0 });
    for (const s of sounding) {
      const tr = s.train;
      const v = s.speed / 22;
      let l: number;
      if (tr === riding) l = 0.3 + 0.55 * v;
      else {
        const dx = Math.max(0, Math.abs(player.feet.x - tr.position.x) - TRAIN_HALF_L);
        const dz = Math.abs(player.feet.z - tr.position.z);
        const d = Math.hypot(dx, dz, player.feet.y - PLATFORM_Y);
        l = (0.08 + 0.9 * v) / (1 + d / 14);
      }
      if (l > loud) {
        loud = l;
        speed = v;
        dominant = { id: tr.id, distance: s.distance, speed: s.speed, braking: s.braking };
      }
    }
    const aboardSound = riding !== null && riding !== silverTrain;
    // Inside a train the platform's sound only comes in through open doors.
    audio.setMuffle(riding ? 1 - Math.min(1, Math.max(0, riding.doorsOpen) * 1.4) : 0);
    audio.setTrainNoise(Math.min(1, loud), speed, aboardSound);
    audio.updateJourney({ trainId: dominant?.id ?? null, distance: dominant?.distance ?? 0, speed: dominant?.speed ?? 0,
      braking: dominant?.braking ?? 0, loudness: Math.min(1, loud), aboard: aboardSound });

    // The world around the platforms.
    const out = listening ? audio.output : null;
    if (out) placeListener(out, player.camera.position, player.yaw);
    const windTrains: WindTrain[] = regular.map((s) => {
      const st = s.state!;
      const stop = s.timetable.stops[st.phase === 'moving' ? st.next : st.stop];
      return { x: st.x, speed: st.speed, dir: stop.track === 1 ? 1 : -1 };
    });
    if (driving) windTrains.push({ x: driver.train.position.x, speed: driver.state.speed, dir: driver.heading });
    if (expressState) windTrains.push({ x: expressState.x, speed: expressState.speed, dir: expressState.dir });
    // The empty train: said once, as it bursts out of the tunnel.
    if (expressState && expressSeen !== expressState.slot && here.station === expressState.station && (here.area === 'platform' || here.area === 'track')
      && Math.abs(expressState.x - player.feet.x) < 160) {
      expressSeen = expressState.slot;
      ambient.say(text.express.caption, 5);
    }
    const windStation = here.station !== null && (here.area === 'platform' || here.area === 'track') && !riding ? world.stations[here.station] : null;
    wind.update(dt, windStation, windTrains, out, stationLight(time));
    lap('sound');
    night.update(dt, time, player.feet.x, out);
    const up = here.area === 'hall' || here.area === 'escalator' || here.area === 'street' ? here.station : null;
    // At a station with a hall at each end of its platform, the one nearest.
    const upHall = up === null ? null : world.hallNear(up, player.feet.x);
    weather.update(dt, time, up === null ? null : { index: up, hall: upHall! }, out);
    // Out of a door in the open the street only shows through it, so from the escalators its houses never float in view.
    world.showStreet(up !== null && (here.area !== 'escalator' || upHall!.exit.cut > 0) ? up : null, player.feet.x);
    world.underSight(player.feet);
    // Out in the open: the sky, daylight, a far horizon in the fog, and rain or snow. Up on a street too, and from its
    // hall the sky shows through the open top of the stairs.
    const street = here.area === 'street' ? upHall!.exit.street : null;
    const open = street ? world.streetOpen(here.station!, player.camera.position)
      : here.area === 'hall' || here.area === 'escalator' || here.area === 'service' ? 0 : world.outdoorAt(player.camera.position);
    // Up the side stairs from a hall under the tracks, the second flight climbs in an open cut.
    const sideStairs = here.area === 'hall' && !!upHall!.exit.across && upHall!.exit.across * player.feet.z > HALL_HALF_W + 0.5;
    const skyAbove = here.area === 'hall' && (upHall!.exit.open > 0 || sideStairs);
    // There, in a hall whose stairs open to the sky and in one with a door straight out (onto the street in the open,
    // or onto the square beside the tracks under a viaduct), the city and the sky show as they are outside, with no
    // dark houses far off: the fog and the view are the street's, while its rain and light stay outside. Within the
    // hall the fog never reaches either way.
    const door = here.area === 'hall' && (!!upHall!.exit.across || (upHall!.exit.cut === 0 && !!upHall!.exit.street));
    const seen = skyAbove || door ? 1 : open;
    sky.update(player.camera.position, time, weather.state);
    setDaylight(sky.daylight);
    const fog = scene.fog as Fog;
    fog.color.copy(underground).lerp(sky.horizon, seen);
    fog.near = 30 + 50 * seen;
    fog.far = 175 + 235 * seen;
    (scene.background as Color).copy(fog.color);
    const far = Math.max(185 + 235 * seen, skyAbove ? SKY_RADIUS + 20 : 0);
    if (Math.abs(player.camera.far - far) > 4) { player.camera.far = far; player.camera.updateProjectionMatrix(); }
    hemisphere.intensity = 2.4 * (1 + open * Math.max(0, sky.daylight - 0.4));
    updatePower(open);
    openWeather.update(dt, time, weather.state, player.camera.position, open, street ? street.y : -Infinity);
    lap('sky');
    const rider = services.find((s) => s.train === riding && s.active);
    const hour = stockholm(time).hours;
    critters.update(dt, here, world.stations, player.feet, regular.map((s) => ({ x: s.state!.x, z: s.state!.z, speed: s.state!.speed })), hour > 6 && hour < 21.5 && serviceOpen(time), out);
    lost.update(dt, player.feet, out, player.camera);
    signals.update(dt, [...carriers(), ...(expressState ? [expressTrain] : [])].map((t) => ({ x: t.position.x, z: t.position.z })), player.feet.x,
      regular.map((s) => ({ id: s.train.id, state: s.state!, timetable: s.timetable })), out, player.feet);
    trackWork.update(dt, time, player.feet, out);
    const found = riding ? null : exploration.visit(here, player.feet.x);
    if (found) hud.notice(text.explore.found, inLanguage(found), 3);
    if (!player.seated) playerSeat = null;
    carriageLife.update(dt, time, services, riding, busyness(time), playerSeat, player.feet, people, out);
    rideLight.update(dt, riding, here.area === 'tunnel' || (!!here.label && here.area === 'track'), rideSpeed, { feet: player.feet, yaw: player.yaw, seated: player.seated, seatYaw: player.seatYaw, seatSide: player.seatSide });
    if (player.stepped > 0 && !driving) {
      const surface: Surface = riding ? 'rubber' : here.area === 'escalator' ? 'metal' : here.area === 'track' || here.area === 'tunnel' ? (player.feet.y < 0.5 ? 'gravel' : 'concrete')
        : here.area === 'service' || here.label === text.kymlinge.name ? 'concrete' : here.label ? 'tile' : 'stone';
      footsteps.update(player.stepped, player.running, surface, out);
    } else footsteps.rest();
    coffee.update(dt, time, out);
    const onPlatform = here.station !== null && !here.label && (here.area === 'platform' || here.area === 'track') ? world.stations[here.station] : null;
    platformLife.update(dt, time, onPlatform, player.feet, regular.map((s) => ({ index: s.index, train: s.train, timetable: s.timetable, clock: s.clock, state: s.state!, active: s.active })), people, out, era.past);
    const near = here.station !== null && (here.area === 'platform' || here.area === 'track' || here.area === 'hall' || here.area === 'escalator') ? world.stations[here.station] : null;
    regulars.update(dt, time, near, player.feet, services, riding, people && !era.past, realOn);
    festivities.update(dt, time, here, player.feet, services, rider ? { index: rider.index, train: rider.train } : null, occasion(time), people, out);
    disruptions.update(dt);
    warnings.update(dt);
    for (const busker of buskers) busker.update(dt, time, player.camera.position, out);
    for (const sax of saxophonists) sax.update(dt, time, player.camera.position, out);
    for (const riders of beltRiders) riders.update(dt, time, player.feet, people, world.escalatorsRunning, busyness(time), era.past);
    lap('life');
    // The rush hour crowd presses on the player next frame.
    player.push.set(0, 0, 0);
    player.pace = 1;
    preacher.update(dt, time, here, player.feet, riding && riding !== driver.train ? riding : null, out);
    player.pace = Math.min(player.pace, preacher.pace);
    for (const rush of rushes) {
      rush.update(dt, time, player.feet, player.yaw, out);
      player.push.add(rush.push);
      player.pace = Math.min(player.pace, rush.pace);
    }
    const moving: Array<EffectTrain & AmbientTrain> = regular.map((s) => {
      const st = s.state!;
      const stop = s.timetable.stops[st.phase === 'moving' ? st.next : st.stop];
      return { train: s.train, id: s.train.id, x: st.x, z: st.z, speed: st.speed, dir: stop.track === 1 ? 1 : -1 };
    });
    if (expressState) moving.push({ train: expressTrain, id: expressTrain.id, x: expressState.x, z: expressState.z, speed: expressState.speed, dir: expressState.dir });
    effects.update(time, player.feet, moving, riding, weather.state.temperature, out);
    ambience.update({
      time, dt, listener: player.feet, location: here, trains: moving, riding: moving.find((m) => m.train === riding) ?? null,
      people, busy: busyness(time), occasion: occasion(time), escalatorsRunning: world.escalatorsRunning, tourists: summerTimetable(time), past: era.past,
    }, out);
    hallLife.update(dt, time, here.area === 'hall' ? here.station : null, player.feet, player.camera, isCold(weather.state.temperature));
    const fareServices: FareService[] = services.filter((s) => s.state).map((s) => ({ index: s.index, train: s.train, time: s.clock, state: s.state!, active: s.active, timetable: s.timetable }));
    fares.update(dt, time, player.feet, fareServices.find((s) => s.train === riding) ?? null, fareServices, out);
    lap('effects');
    const me: GhostPose = { x: player.feet.x, y: player.feet.y, z: player.feet.z, yaw: player.yaw, ride: -1, lx: 0, lz: 0 };
    // Other players follow their own trains; a real journey is not one they share by index.
    const rideIndex = realOn ? -1 : riding === silverTrain ? SILVER_INDEX : services.findIndex((s) => s.train === riding);
    if (riding && rideIndex >= 0) { me.ride = rideIndex; me.lx = player.feet.x - riding.position.x; me.lz = player.feet.z - riding.position.z; }
    ghosts.update(dt, me, player.feet, (ride) => {
      if (realOn) return null;
      const t = ride === SILVER_INDEX ? silverTrain : services[ride]?.train;
      return t && t.isActive ? { x: t.position.x, z: t.position.z } : null;
    });

    departuresTimer -= dt;
    if (departuresTimer <= 0) {
      departuresTimer = 1;
      updateDepartures();
      updateTrip();
      const clock = stockholm(time);
      // Only clocks the player could see get their second hand redrawn.
      for (const s of world.stations) if (Math.abs(s.cx - player.feet.x) < CLOCK_REACH) s.setTime(clock);
      const onLine = lineHere();
      hud.setLine(net.lines[onLine].name);
      // Only the line the player is on has its announcements fetched.
      if (onLine !== warmedLine) {
        warmedLine = onLine;
        audio.preload([...new Set(net.stations.filter((s) => s.lines.includes(onLine)).flatMap((s) => Object.values(STATION_RECORDINGS[s.name] ?? {})))]);
      }
      hud.setClock(loopOffset ? `${formatClock(time)} · ${text.loop.badge}` : formatClock(time));
      const today = stockholm(time);
      const conditions = { busy: busyness(time), season: season(time), wet: weather.umbrellas(time) || warnings.wet, storm: warnings.wet, occasion: occasion(time), heat: summerHeat(today), tourists: summerTimetable(time), past: era.past };
      crowd.setConditions(conditions);
      stationWeights.forEach((w, i) => { escalatorBusy[i] = Math.min(1, conditions.busy * w); });
      for (const rush of rushes) rush.setConditions(conditions);
      // Posters, broken escalators, the newspaper's date and winter fog on the windows follow the day.
      for (const s of world.stations) {
        // SL's real reports of a broken escalator win over the made-up day's.
        const broken = escalatorOutOfOrder(time, s.index) || disruptions.escalatorOut(s.name);
        s.clutter.setDay(time, broken);
        for (const esc of s.escalators) esc.stoppedLane = broken ? -1 : 0;
      }
      const fogged = season(time) === 'winter' && isCold(weather.state.temperature);
      setWindowFog(fogged ? 1 : 0);
      cabin.setDay(time, fogged, summerHeat(today), era.past);
      lost.setDay(time);
      wind.setDay(time, era.past);
      hud.drawMap(carriers().map((t) => ({ x: t.position.x, z: t.position.z })), player.feet, exploration.explored());
      if (++placeTimer % 5 === 0) rememberPlace();
      // After the last train: say so, once a night, when you reach a platform.
      if (!realOn && !serviceOpen(time) && here.area === 'platform' && here.station !== null) {
        const tonight = `${clock.year}-${clock.month}-${clock.day}`;
        if (nightCaption !== tonight) {
          nightCaption = tonight;
          const first = operations.nextArrival(time, here.station, isLineTerminal(net, here.station, 1) ? 2 : 1);
          hud.say(format(text.clock.closedCaption, { time: first ? formatClock(time + first.eta) : '05:00' }), 7);
        }
      }
    }

    lap('boards');
    renderer.render(scene, player.camera);
    lap('render');
    workMs = performance.now() - now;
    if (debug) {
      const ms = performance.now() - now;
      if (ms > 40) {
        const here = world.locate(player.feet);
        slowLog.push({ at: Math.round(time), ms: Math.round(ms), parts: Object.fromEntries(frameLaps.filter(([, v]) => v > 2).map(([k, v]) => [k, Math.round(v)])), where: `${here.station !== null ? net.stations[here.station].name : '-'} ${here.area} x=${Math.round(player.feet.x)}` });
        if (slowLog.length > 40) slowLog.shift();
      }
    }
  }

  if (debug) {
    // Optional camera pose, for screenshots: ?debug&x=..&y=..&z=..&yaw=..&pitch=..
    // Time: `t` (seconds from a fixed weekday noon), `clock=HH:MM`, `weather=snow`, `silverpilen`.
    const num = (k: string) => (params.has(k) ? Number(params.get(k)) : undefined);
    const px = num('x');
    const py = num('y');
    const pz = num('z');
    if (px !== undefined || py !== undefined || pz !== undefined) {
      player.teleport(new Vector3(px ?? player.feet.x, py ?? player.feet.y, pz ?? player.feet.z), num('yaw'));
    }
    const pp = num('pitch');
    if (pp !== undefined) player.pitch = pp;
    Object.assign(window, {
      __us: {
        physics,
        player,
        world,
        timetable,
        timetables,
        operations,
        services,
        real,
        silver,
        driver,
        weather,
        warnings,
        ghosts,
        fares,
        renderer,
        lost,
        crowd,
        get time() {
          return time;
        },
        set time(t: number) {
          time = t;
        },
        /** Sets the time as the game does after a pause: whoever rides a train stays aboard it. */
        jump(t: number) {
          jumpTime(t);
        },
        goto(i: number) {
          const s = world.stations[i];
          player.teleport(s.spawn, s.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2);
        },
        /**
         * Up on the street out of a station's hall `k` (the station by name or index), at the top of its stairs or out
         * of its door, facing out; from a hall under the tracks in the open, on the square its side stairs come up on.
         */
        street(station: number | string, k = 0) {
          const s = typeof station === 'number' ? world.stations[station] : world.stations.find((t) => t.name === station);
          const hall = s?.halls[k];
          const plan = s && net.stations[s.index].halls?.[k];
          if (s && hall?.exit.across && plan?.down) {
            // Out on the square beyond the top of the stairs, which come up in its middle.
            const { square, across } = underHall(plan, k);
            player.teleport(new Vector3(s.cx + (square.x0 + square.x1) / 2, -s.ground + 0.6, across > 0 ? square.z1 - 4 : square.z0 + 4), across > 0 ? Math.PI : 0);
            return;
          }
          if (!hall?.exit.street) return;
          const { exit } = hall;
          player.teleport(new Vector3(exit.x + hall.dir * (exit.cut + (exit.cut ? 2 : 6)), exit.street!.y + 0.1, 0), hall.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        },
        kymlinge() {
          player.teleport(world.kymlinge.spawn, -Math.PI / 2);
        },
        rush: rushes[0],
        /** The City passage, facing the crowd toward the commuter trains. */
        city() {
          const p = world.stations.find((s) => s.passage)?.passage;
          if (p) player.teleport(new Vector3((p.bounds.x0 + p.bounds.x1) / 2, p.bounds.y, p.bounds.z0 + 20), Math.PI);
        },
        /**
         * Times `seconds` of frames run by hand: `renderMs` waits for the GPU after each render (a one-pixel read),
         * `logicMs` is the rest. Also the last frame's draw calls and triangles, and what is in GPU memory.
         */
        perf(seconds = 3, rate = 30) {
          const gl = renderer.getContext();
          const pixel = new Uint8Array(4);
          const render = renderer.render.bind(renderer);
          let renderMs = 0;
          renderer.render = (s, c) => {
            const t = performance.now();
            render(s, c);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            renderMs += performance.now() - t;
          };
          const t0 = performance.now();
          try { this.step(seconds, rate); } finally { renderer.render = render; }
          const frames = seconds * rate;
          const total = performance.now() - t0;
          const round = (v: number) => Math.round(v * 100) / 100;
          return {
            frameMs: round(total / frames), logicMs: round((total - renderMs) / frames), renderMs: round(renderMs / frames),
            calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0,
            where: world.locate(player.feet),
          };
        },
        /**
         * In the dev server: times every method of every class in the game's modules over `seconds` of frames run by
         * hand, and lists the ones that take the most, in milliseconds per frame (a method's time includes what it
         * calls) and calls per frame.
         */
        async hotspots(seconds = 3, rate = 15, top = 25) {
          if (!import.meta.env.DEV) return null;
          const modules = import.meta.glob('./**/*.ts');
          const stats = new Map<string, [number, number]>();
          const undo: Array<() => void> = [];
          for (const [path, load] of Object.entries(modules)) {
            const mod = (await load()) as Record<string, unknown>;
            for (const [name, value] of Object.entries(mod)) {
              if (typeof value !== 'function' || !value.prototype) continue;
              const proto = value.prototype as Record<string, unknown>;
              for (const key of Object.getOwnPropertyNames(proto)) {
                const d = Object.getOwnPropertyDescriptor(proto, key);
                if (key === 'constructor' || !d || typeof d.value !== 'function') continue;
                const fn = d.value as (...args: unknown[]) => unknown;
                const label = `${path.replace(/^\.\//, '').replace(/\.ts$/, '')}: ${name}.${key}`;
                proto[key] = function (this: unknown, ...args: unknown[]) {
                  const t = performance.now();
                  try { return fn.apply(this, args); } finally {
                    const e = stats.get(label) ?? [0, 0];
                    e[0] += performance.now() - t;
                    e[1]++;
                    stats.set(label, e);
                  }
                };
                undo.push(() => { proto[key] = fn; });
              }
            }
          }
          const frames = seconds * rate;
          const t0 = performance.now();
          try { this.step(seconds, rate); } finally { for (const u of undo) u(); }
          const round = (v: number) => Math.round(v * 100) / 100;
          return {
            frameMs: round((performance.now() - t0) / frames),
            top: [...stats].sort((x, y) => y[1][0] - x[1][0]).slice(0, top).map(([label, [ms, n]]) => ({ method: label, ms: round(ms / frames), calls: round(n / frames) })),
          };
        },
        /** With `?spector` in the dev server: captures the next frame with SpectorJS and sums it up. */
        async spector(commands = 6000) {
          if (!import.meta.env.DEV || !params.has('spector')) return null;
          const mod = (await import('spectorjs')) as unknown as { Spector?: new () => SpectorLike; default?: { Spector: new () => SpectorLike } };
          const Spector = mod.Spector ?? mod.default!.Spector;
          const w = window as unknown as { __spector?: SpectorLike };
          const spector = (w.__spector ??= new Spector());
          const capture = await new Promise<SpectorCapture>((resolve) => {
            spector.onCapture.add(resolve);
            spector.captureCanvas(renderer.domElement, commands, true);
            this.step(2 / 30, 30);
          });
          return summarizeCapture(capture);
        },
        /** The slowest recent frames (over 40 ms), with how long each part of them took. */
        slowFrames(clear = false) {
          const out = [...slowLog];
          if (clear) slowLog.length = 0;
          return out;
        },
        /**
         * Back to full resolution, as at the start, for timing a scene: the slow frames of a warm-up (building what
         * lies near a station far off) lower it a notch, and it only comes back after a minute of quick frames.
         */
        resetResolution() {
          resolution.reset();
          resize();
          return renderer.getPixelRatio();
        },
        /** Seats the player on the next train pulling into a blue line station, as the first minute does. */
        ride() {
          staged = false;
          stageArrival();
          return riding?.id ?? null;
        },
        /** How long each part of the frame takes, in milliseconds per frame, over `seconds` of frames run by hand. */
        laps(seconds = 2, rate = 15) {
          laps.clear();
          this.step(seconds, rate);
          const frames = seconds * rate;
          return Object.fromEntries([...laps].map(([k, v]) => [k, Math.round((v / frames) * 100) / 100]));
        },
        /** Stages scene `i` of a life on the blue line at once, starting one if none plays. */
        lifeScene(i: number) {
          if (!life) startLife();
          if (!life) return null;
          life.index = Math.max(0, Math.min(life.scenes.length - 1, i));
          lifeStage();
          life.cutting = false;
          return life.scenes[life.index];
        },
        summonSilverpilen() {
          silver.summon(time);
        },
        /** Where Silverpilen is this frame, from the timetable or among SL's trains, or null. */
        silverNow: () => silverState,
        /** The year the world is in: `__us.era.set('1975')`. */
        era,
        /** A made-up power cut, as `?stromavbrott` makes, starting `after` seconds from now. */
        powerCut(after = 2, seconds = 150) {
          forceCut(time + after, seconds);
        },
        drive: () => startDriving(),
        stopDriving: () => stopDriving(),
        /** Runs the game for `seconds` at `rate` frames per second, right now, even in a hidden tab. */
        step(seconds = 1, rate = 30) {
          manualDt = 1 / rate;
          try { for (let i = 0; i < seconds * rate; i++) frame(); } finally { manualDt = null; }
          return this.info();
        },
        setWeather(kind: WeatherKind) {
          weather.state = { kind, intensity: kind === 'rain' || kind === 'snow' || kind === 'sleet' ? 0.8 : 0, temperature: kind === 'snow' ? -4 : 8, source: 'debug' };
        },
        info() {
          return { renderer: renderer.info.render, memory: renderer.info.memory, feet: player.feet.toArray(), riding: riding?.id ?? null, where: world.locate(player.feet), clock: formatClock(time), open: serviceOpen(time), silverpilen: silverState };
        },
      },
    });
  }

  // The power cut: the lights die for everyone at once, the trains stand dark and the phone torches come out.
  const power = new PowerLights(scene);
  if (params.has('stromavbrott')) forceCut(time + 6, Number(params.get('stromavbrott')) || 150);
  let cutSeen: number | null = null;
  let cutTalk = 0;
  const torches: Torch[] = Array.from({ length: 8 }, () => ({ pos: new Vector3(), dir: new Vector3(), power: 0 }));
  const blink = (t: number) => (Math.sin(t * 41) + Math.sin(t * 17.3) > 0.4 ? 1 : 0.2);
  function updatePower(open: number): void {
    const out = audio.output;
    const cut = realOn || era.past ? null : powerOut(time);
    let level = 0;
    if (cut) {
      const t = time - cut.start;
      level = t < 1.6 ? blink(t) : 1;
      if (cutSeen !== cut.start) {
        cutSeen = cut.start;
        cutTalk = 0;
        if (out) { thump(out, 0.35, 90); tone(out, out.bus, 120, 0.05, 1.8, { glideTo: 40 }); }
        hud.say(text.power.out, 6);
      }
      if (t > 4 && cutTalk === 0) { cutTalk = 1; hud.say(touchMode ? text.power.torchTouch : text.power.torch, 5); }
      if (t > 35 && cutTalk === 1) {
        cutTalk = 2;
        audio.announce(text.power.announcement, () => hud.say(text.power.announcement, 10), () => {}, true);
      }
    } else if (cutSeen !== null) {
      const back = powerOut(time - 2.5);
      const t = back ? time - back.end : Infinity;
      level = t < 2.5 ? 1 - blink(t) * (t / 2.5) : 0;
      if (!back) {
        cutSeen = null;
        if (out) { thump(out, 0.3, 140); tone(out, out.bus, 50, 0.04, 2.5, { glideTo: 120 }); }
        hud.say(text.power.back, 5);
      }
    }
    // Out in the open the daylight still shines.
    level *= 1 - open;
    hemisphere.intensity *= 1 - 0.85 * level;
    if (level <= 0) { power.update(0, [], null); return; }
    const since = cut ? time - cut.start : 99;
    // The player's own phone, a little below and to the right of the eyes.
    const cam = player.camera;
    const own = torches[0];
    cam.getWorldDirection(own.dir);
    own.pos.copy(cam.position).addScaledVector(own.dir, 0.2).y -= 0.25;
    own.power = Math.min(1, Math.max(0, (since - 3) / 0.6));
    // Others, one after another, sweeping over the rock.
    const holders = crowd.holders(player.feet.x, torches.length - 1, riding ? riding.group : null);
    const clock = performance.now() / 1000;
    for (let i = 1; i < torches.length; i++) {
      const h = holders[i - 1];
      const tr = torches[i];
      if (!h) { tr.power = 0; continue; }
      const yaw = h.yaw + Math.sin(clock * 0.4 + i * 1.9) * 0.9;
      const pitch = -0.1 + Math.sin(clock * 0.33 + i) * 0.4;
      tr.pos.set(h.x, h.y, h.z);
      tr.dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      tr.power = 0.55 * Math.min(1, Math.max(0, (since - 5 - i * 2.2) / 0.5));
    }
    const s = world.nearestStation(player.feet.x);
    power.update(level, torches, Math.abs(s.cx - player.feet.x) < 200 ? { cx: s.cx, walls: s.platforms } : null);
  }

  // Continue where the player last stood, instead of the staged first minute.
  if (place) {
    staged = true;
    welcomeBack = format(text.continued, { station: place.station });
    player.teleport(new Vector3(place.x, place.y, place.z), place.yaw);
  }
  if (divePlan) {
    const at = legPlatform(divePlan.legs[0]);
    player.teleport(at.feet, at.yaw);
  } else if (diveTo >= 0) {
    const s = world.stations[diveTo];
    player.teleport(s.spawn, s.exitDir > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  updateTrains(false);
  player.update(0);
  loadMark('setup-done');
  // The first resume can put the player aboard a train at another station. Prepare that view too, before the
  // loading screen goes away, rather than force its whole build into the first playable frame.
  if (!staged) {
    const arrival = arrivalTrain();
    if (arrival) await world.prepare(arrival.svc.train.position.x);
  }
  world.ensureBuilt(player.feet.x);
  await settle(0.99);
  // The streets stay hidden until someone climbs up to one, so nothing compiles their shaders: warm one now (they share
  // their materials), or the first street you come out on would stutter while it does.
  const street = world.stations.find((s) => s.exit.street?.group)?.exit.street?.group;
  if (street) world.warm?.(street);
  loadMark('gpu-start');
  await renderer.compileAsync(scene, player.camera);
  renderer.render(scene, player.camera);
  renderNeeded = false;
  loadMark('gpu-done');
  await settle(1);
  const loadS = (performance.now() - (options.since ?? loadStart)) / 1000;
  // Physics, the starting view and its first GPU render are ready. Let the player in without a minimum timer.
  loading.classList.add('is-done');
  window.setTimeout(() => loading.remove(), debug ? 0 : 400);
  last = performance.now();
  // A frame that throws would throw again on every frame after it: the loop stops, the error is reported
  // (`crash.ts`), and a card offers the page back where the player stood, as after a lost WebGL context.
  let crashed = false;
  const crash = (err: unknown) => {
    if (crashed) return;
    crashed = true;
    renderer.setAnimationLoop(null);
    console.error(err);
    reportError(err, true);
    try { rememberPlace(); } catch { /* Where the player stands may be what broke. */ }
    try { audio.suspend(); } catch { /* The page reloads anyway. */ }
    player.enabled = listening = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const card = document.createElement('div');
    card.className = 'loading crash';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-labelledby', 'crash-title');
    card.setAttribute('aria-describedby', 'crash-note');
    card.innerHTML = `<div class="loading-card"><p class="loading-title" id="crash-title"></p><p class="loading-note" id="crash-note"></p>
      <button type="button" class="crash-reload"></button><p class="crash-links"><a class="crash-home"></a><a class="crash-mail"></a></p></div>`;
    card.querySelector('#crash-title')!.textContent = text.crash.title;
    card.querySelector('#crash-note')!.textContent = text.crash.note;
    const reload = card.querySelector<HTMLButtonElement>('.crash-reload')!;
    reload.textContent = text.crash.reload;
    reload.addEventListener('click', () => { comeBack(); location.reload(); });
    const home = card.querySelector<HTMLAnchorElement>('.crash-home')!;
    home.textContent = text.crash.home;
    home.href = location.pathname;
    const mail = card.querySelector<HTMLAnchorElement>('.crash-mail')!;
    mail.textContent = text.crash.mail;
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    mail.href = `mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent(text.crash.subject)}&body=${encodeURIComponent(`${text.crash.body}\n\n\n---\n${message.slice(0, 300)}`)}`;
    root.appendChild(card);
    reload.focus();
  };
  // At most 60 frames a second (30 in battery saver): a 120 or 144 Hz screen would otherwise have the game draw
  // twice what anyone sees the difference of, and a laptop spin up its fans. A tick that comes too soon is skipped,
  // and the time over a whole frame is carried, so a 144 Hz screen still averages 60.
  let ranAt = -Infinity;
  renderer.setAnimationLoop((now: number) => {
    const interval = 1000 / (settings.value.battery ? FPS_BATTERY : FPS_MOST);
    const since = now - ranAt;
    if (manualDt === null && since < interval - FRAME_SLACK_MS) return;
    ranAt = since >= interval && since < interval * 3 ? now - (since % interval) : now;
    try { frame(); } catch (err) { crash(err); }
  });
  crashFacts(() => ({ where: world.nearestStation(player.feet.x).name, gpu: gpuName(renderer.getContext()) }));
  // Not in debug: the measuring scripts drive the game there, and their frames are not a player's.
  telemetry = new Telemetry(debug ? null : relayUrl(), () => ({ touch: touchMode, scale: resolution.level, pixelRatio: renderer.getPixelRatio(), loadS, real: realOn, passengers: people, gpu: gpuName(renderer.getContext()) }));
  window.addEventListener('pagehide', () => telemetry?.leave());
  window.addEventListener('pagehide', () => rememberPlace());
  document.addEventListener('visibilitychange', () => { if (document.hidden) rememberPlace(); });
  if (options.showcase || params.has('showcase')) startShow();
  if (options.life || params.has('liv')) startLife();
  // A dive goes straight onto the platform, not to the pause menu. The click that picked the station is long gone by
  // now, so the browser may refuse the mouse: then the game runs anyway and the next click on it takes the mouse.
  if (divePlan) startTrip(divePlan.from, divePlan.to);
  if (diveTo >= 0 && !debug) {
    audio.start();
    setPaused(false);
    if (!divePlan) hud.say(format(touchMode ? text.intro.platform : text.intro.platformLook, { station: stationName(diveTo) }), 6);
    if (!touchMode && typeof canvas.requestPointerLock === 'function') {
      try { void (canvas.requestPointerLock() as Promise<void> | undefined)?.catch(() => {}); } catch { /* Next click. */ }
    }
  }
}
