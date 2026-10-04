import './network.css';
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, FogExp2, Group, InstancedMesh, Line,
  LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Plane, Points, PointsMaterial, Quaternion,
  Raycaster, Scene, SphereGeometry, SRGBColorSpace, TubeGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import sv from '../i18n/sv.json';
import en from '../i18n/en.json';
import { busyness, formatClock, stockholm, stockholmEpoch } from '../game/clock';
import { CONNECTORS, NETWORK } from '../game/line';
import { ghostUrl } from '../game/relay';
import { realTrainsAvailable } from '../game/sl';
import { LINES } from '../landing/lines';
import { fetchSightings, RealTrains } from '../landing/realTrains';
import { gameTrains, layout, ROUTE_STATIONS, type MapTrain } from '../landing/trains';
import { allRoutes, alongTrack, blend, depthOf, FLAT, lerp, linePoints, placeTrain, silverTrain, stationsOf, trainPoint, type Ground, type LinePoints, type NetPoint, type Relief } from './data';
import { dayOf, posterFile, renderPoster, type ExposureDay, type ExposureView } from './exposure';
import { cityGeometry, groundGeometry, groundTexture, section, sectionGeometry, type CityTile } from './surface';
import { decodeTerrain, groundOf, type Terrain, type TerrainFile } from './terrain';
import terrainUrl from './terrain.json?url';

/** The city's buildings, a file per tile (`scripts/osm-city.ts`), fetched when the view opens. */
const CITY = import.meta.glob<string>('./city/*.json', { query: '?url', import: 'default', eager: true });

/**
 * The whole network at once: every line a glowing tube at its real depth under a see-through Stockholm with its hills,
 * water and buildings, cut open down the middle of the view so one sees the tunnels in the rock, every train a point
 * of light with a fading trail, from the same timetables as the game (or SL's real trains). Heights are stretched
 * upward more the further out one looks, or not at all at true scale. A time scrubber, a morph from geography to the
 * line map, a note per departure, other players as fireflies, the day's long exposure, and a click on a station to go
 * down there. Loaded on its own with `import()`, like the game.
 */

const text = (document.documentElement.lang === 'en' ? en : sv).network;
const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));

/** Meters per scene unit. */
const UNIT = 100;
/** Heights are stretched this much seen from far out, so the network reads as roots under the city, */
const STRETCH_FAR = 10;
/** and this much seen from close by. */
const STRETCH_NEAR = 2;
/** The cut stands this far off when there is none, in scene units: nothing is on the far side of it. */
const NO_CUT = 1e6;
/** Samples back in time per train for its trail. */
const TRAIL = 8;
const MAX_TRAINS = 420;
const MAX_GHOSTS = 64;
/** A train: three C20 units of 46.5 m, a little apart, each drawn as a car along the track. */
const CAR = { length: 46.5, gap: 1.5, units: 3 };

/** A car's side: silver, a dark band of lit windows, the doors, a darker skirt. */
function carSide(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9dee4';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#1b2230';
  g.fillRect(6, 16, 500, 22);
  // Windows lit from inside, with the doors between them.
  for (let k = 0; k < 8; k++) {
    const x = 12 + k * 62;
    g.fillStyle = '#ffe2a0';
    g.fillRect(x, 19, 38, 16);
    g.fillStyle = '#8f98a4';
    g.fillRect(x + 44, 12, 12, 44);
  }
  g.fillStyle = '#5d6570';
  g.fillRect(0, 50, 512, 14);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const GLOW: Record<string, string> = { blue: '#4696ff', red: '#ff465f', green: '#3cd778' };
/** A day in a minute. */
const DAY_RATE = 1440;
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const LINE_BASE = [220, 293.66, 329.63];

export interface NetworkOptions {
  /** Go down to a station: start the game there, on a trip to `to` if one was picked. */
  dive(station: string, to?: string): void;
  close(): void;
}


/** A soft round spot for points of light. */
function spot(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Where a point along world x in the game lies on the network: between the two stations of its tunnel. */
function worldToNet(x: number, morph: number, points: LinePoints): NetPoint | null {
  const pointOf = (g: number) => {
    const li = layout.lineOf[g];
    const local = layout.global[li].indexOf(g);
    return blend(points[li][local], morph);
  };
  for (const l of layout.links) {
    let xa = layout.x[l.a];
    let xb = layout.x[l.b];
    if (l.portal) {
      const ghost = layout.x[l.portal.anchor] + l.portal.shift;
      if (l.portal.dir > 0) xa = ghost; else xb = ghost;
    }
    if (x < xa || x > xb) continue;
    const f = (x - xa) / (xb - xa);
    const a = pointOf(l.a);
    const b = pointOf(l.b);
    return { east: lerp(a.east, b.east, f), north: lerp(a.north, b.north, f), depth: lerp(a.depth, b.depth, f), y: lerp(a.y, b.y, f) };
  }
  let near = 0;
  layout.x.forEach((sx, i) => { if (Math.abs(sx - x) < Math.abs(layout.x[near] - x)) near = i; });
  return Math.abs(layout.x[near] - x) < 800 ? pointOf(near) : null;
}

/** Within this far of a station along x a player is at it, on its platform, in its halls or up on its street. */
const AT_STATION = 160;

/** The station nearest `x` along the corridor, by global index. */
function nearestStation(x: number): number {
  let near = 0;
  layout.x.forEach((sx, i) => { if (Math.abs(sx - x) < Math.abs(layout.x[near] - x)) near = i; });
  return near;
}

/** The ground's heights, or none if they could not be fetched: then the city lies flat. */
async function loadTerrain(): Promise<Terrain | null> {
  try {
    const res = await fetch(terrainUrl);
    return res.ok ? decodeTerrain((await res.json()) as TerrainFile) : null;
  } catch {
    return null;
  }
}

export async function mountNetwork(root: HTMLElement, options: NetworkOptions): Promise<() => void> {
  // The ground first: every station's height comes from it.
  const terrain = await loadTerrain();
  const ground: Ground = terrain ? groundOf(terrain) : FLAT;
  const points = linePoints(ground);
  const STATIONS = stationsOf(points);
  root.classList.add('net');
  root.innerHTML = `
    <canvas class="net-canvas" tabindex="0" role="img" aria-label="${text.canvas}"></canvas>
    <div class="net-labels" aria-hidden="true"></div>
    <header class="net-head">
      <h1>${text.title}</h1>
      <p class="net-clock"><strong></strong> <span class="net-count"></span></p>
      <p class="net-players" hidden></p>
      <p class="net-lead">${text.lead}</p>
      <p class="net-source" aria-live="polite" hidden></p>
    </header>
    <button type="button" class="net-close">${text.back}</button>
    <div class="net-bar">
      <label class="net-time"><span>${text.time}</span><input type="range" min="0" max="1439" step="1" aria-label="${text.time}"><output></output></label>
      <button type="button" class="net-more" aria-expanded="false" aria-controls="net-extra">${text.more}</button>
      <div class="net-extra" id="net-extra">
      <div class="net-buttons">
        <button type="button" class="net-day">${text.day}</button>
        <button type="button" class="net-toggle net-sound" aria-pressed="false">${text.sound}</button>
        <button type="button" class="net-toggle net-cut" aria-pressed="true">${text.cut}</button>
        <button type="button" class="net-toggle net-scale" aria-pressed="false">${text.trueScale}</button>
        <button type="button" class="net-exposure">${text.exposure}</button>
      </div>
      <label class="net-morph"><span>${text.geo}</span><input type="range" min="0" max="1" step="0.01" value="0" aria-label="${text.morph}"><span>${text.schematic}</span></label>
      <label class="net-pick"><span>${text.pick}</span><select name="station"><option value="">${text.pickNone}</option></select></label>
      <div class="net-trip" role="group" aria-label="${text.trip}">
        <label><span>${text.tripFrom}</span><select name="from"><option value="">${text.pickNone}</option></select></label>
        <label><span>${text.tripTo}</span><select name="to"><option value="">${text.pickNone}</option></select></label>
        <button type="button" class="net-trip-go" disabled>${text.tripGo}</button>
      </div>
      <p class="net-hint" role="status">${text.hint}</p>
      </div>
      <p class="net-credit">${text.heights} · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${text.buildings}</a></p>
    </div>
    <div class="net-fade"></div>
    <div class="net-poster" hidden role="dialog" aria-modal="true" aria-labelledby="net-poster-title">
      <div class="net-poster-card">
        <button type="button" class="net-poster-x" aria-label="${text.close}"><span aria-hidden="true">×</span></button>
        <h2 id="net-poster-title">${text.exposureTitle}</h2>
        <p>${text.exposureLead}</p>
        <div class="net-poster-controls">
          <label>${text.date} <input type="date" class="net-date" name="date" autocomplete="off"></label>
          <button type="button" class="net-toggle net-view" aria-pressed="false">${text.geo}</button>
        </div>
        <div class="net-poster-image" aria-live="polite"><p>${text.render}</p></div>
        <div class="net-poster-actions">
          <button type="button" class="net-save">${text.save}</button>
          <button type="button" class="net-share" hidden>${text.share}</button>
          <button type="button" class="net-poster-close">${text.close}</button>
        </div>
      </div>
    </div>`;
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const canvas = q<HTMLCanvasElement>('.net-canvas');
  const labelLayer = q<HTMLDivElement>('.net-labels');
  const clockEl = q<HTMLElement>('.net-clock strong');
  const countEl = q<HTMLElement>('.net-count');
  const playersEl = q<HTMLElement>('.net-players');
  const timeInput = q<HTMLInputElement>('.net-time input');
  const timeOut = q<HTMLOutputElement>('.net-time output');
  const dayButton = q<HTMLButtonElement>('.net-day');
  const soundButton = q<HTMLButtonElement>('.net-sound');
  const morphInput = q<HTMLInputElement>('.net-morph input');
  const fade = q<HTMLDivElement>('.net-fade');
  // On a phone everything but the clock folds away, so the bar leaves the network in view (network.css).
  const moreButton = q<HTMLButtonElement>('.net-more');
  moreButton.addEventListener('click', () => {
    const open = moreButton.getAttribute('aria-expanded') !== 'true';
    moreButton.setAttribute('aria-expanded', String(open));
    moreButton.closest('.net-bar')!.classList.toggle('is-open', open);
  });
  // Players who ask for less motion get no camera flight, no breathing stations and no flickering fireflies.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const numbers = new Intl.NumberFormat(document.documentElement.lang || 'sv');
  const percent = new Intl.NumberFormat(document.documentElement.lang || 'sv', { style: 'percent' });

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.localClippingEnabled = true;
  const scene = new Scene();
  scene.background = new Color('#04060a');
  scene.fog = new FogExp2('#04060a', 0.0028);
  const camera = new PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(-40, 150, 185);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-10, -4, 0);
  controls.enableDamping = !still;
  // The arrow keys move the view once the canvas has focus.
  controls.listenToKeyEvents(canvas);
  controls.maxDistance = 520;
  controls.minDistance = 3;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.update();

  // How much heights are stretched: more seen from far out, where 30 meters down would not show, and at true scale not
  // at all. The tubes are rebuilt when it has moved enough; the city is a group stretched as a whole.
  let trueScale = false;
  let stretch = STRETCH_FAR;
  const stretchWanted = () => {
    if (trueScale) return 1;
    const d = camera.position.distanceTo(controls.target);
    return Math.min(STRETCH_FAR, Math.max(STRETCH_NEAR, STRETCH_NEAR * (d / 10) ** (Math.log(STRETCH_FAR / STRETCH_NEAR) / Math.log(30))));
  };
  /** How big the tubes, stations and trains are drawn: smaller close by, where they would hide the city. */
  const girth = () => Math.min(1, Math.max(0.15, camera.position.distanceTo(controls.target) / 200));
  let size = girth();
  const toScene = (p: NetPoint, out = new Vector3()) => out.set(p.east / UNIT, (p.y * stretch) / UNIT, -p.north / UNIT);

  // The city, in meters: the ground seen through, with its hills and water, the buildings, and the face of the cut.
  const REACH = 26_000;
  const surface = new Group();
  scene.add(surface);
  // The cut: a notch taken out of the city in front of the point looked at, as wide as the face of the cut through
  // that point and a little deeper toward the viewer, so one looks into the ground at the tunnels. Four walls, and
  // the city is left out only inside all of them.
  const cut = new Plane(new Vector3(1, 0, 0), NO_CUT);
  const cutBack = new Plane(new Vector3(1, 0, 0), 0);
  const cutLeft = new Plane(new Vector3(1, 0, 0), 0);
  const cutRight = new Plane(new Vector3(1, 0, 0), 0);
  const cutPlanes = [cut, cutBack, cutLeft, cutRight];
  const groundMap = groundTexture(REACH, terrain, ground);
  const groundMat = new MeshBasicMaterial({ map: groundMap, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide, clippingPlanes: cutPlanes, clipIntersection: true });
  const groundMesh = new Mesh(groundGeometry(REACH, terrain, ground), groundMat);
  groundMesh.renderOrder = -2;
  surface.add(groundMesh);
  const cityMat = new MeshBasicMaterial({ color: '#8ea4c4', vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide, clippingPlanes: cutPlanes, clipIntersection: true });
  const cityMeshes: Mesh[] = [];
  let disposed = false;
  // The buildings come a tile at a time, after the view is up.
  void (async () => {
    for (const [path, url] of Object.entries(CITY)) {
      try {
        const res = await fetch(url);
        if (!res.ok || disposed) continue;
        const data = (await res.json()) as CityTile;
        if (disposed) return;
        const mesh = new Mesh(cityGeometry(path.replace(/^.*\/|\.json$/g, ''), data, ground), cityMat);
        mesh.renderOrder = -1;
        cityMeshes.push(mesh);
        surface.add(mesh);
      } catch { /* The city without that tile. */ }
    }
  })();
  const sectionGeo = sectionGeometry();
  const sectionMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
  const sectionFace = new Mesh(sectionGeo.face, sectionMat);
  sectionFace.renderOrder = -1;
  const sectionEdge = new Line(sectionGeo.edge, new LineBasicMaterial({ color: '#d9b98c', transparent: true, opacity: 0.7 }));
  sectionFace.frustumCulled = sectionEdge.frustumCulled = false;
  surface.add(sectionFace, sectionEdge);
  let cutOn = true;
  const cutButton = q<HTMLButtonElement>('.net-cut');
  cutButton.addEventListener('click', () => {
    cutOn = !cutOn;
    cutButton.setAttribute('aria-pressed', String(cutOn));
  });
  const scaleButton = q<HTMLButtonElement>('.net-scale');
  scaleButton.addEventListener('click', () => {
    trueScale = !trueScale;
    scaleButton.setAttribute('aria-pressed', String(trueScale));
  });
  const lastCut = new Vector3(NaN, 0, 0);
  const cutDir = new Vector3();
  /** Moves the cut to where the view looks from, and fills its face again when it has moved. */
  const placeCut = () => {
    const show = cutOn && morph < 0.98;
    sectionFace.visible = sectionEdge.visible = show;
    if (!show) { cut.constant = NO_CUT; return; }
    cutDir.subVectors(controls.target, camera.position).setY(0);
    if (cutDir.lengthSq() < 1e-6) cutDir.set(0, 0, -1);
    cutDir.normalize();
    const far = camera.position.distanceTo(controls.target);
    const half = Math.min(REACH, Math.max(1500, Math.round((far * UNIT * 0.3) / 250) * 250));
    const across = new Vector3(-cutDir.z, 0, cutDir.x);
    const at = cutDir.dot(controls.target), side = across.dot(controls.target);
    cut.normal.copy(cutDir);
    cut.constant = -at;
    cutBack.normal.copy(cutDir).negate();
    cutBack.constant = at - far * 1.1;
    cutLeft.normal.copy(across).negate();
    cutLeft.constant = side - half / UNIT;
    cutRight.normal.copy(across);
    cutRight.constant = -side - half / UNIT;
    // A new face only when the view has turned or moved enough to see it.
    const key = new Vector3(Math.atan2(cutDir.x, cutDir.z), controls.target.x, controls.target.z);
    if (Math.abs(key.x - lastCut.x) < 0.004 && Math.hypot(key.y - lastCut.y, key.z - lastCut.z) < 0.05 && half === lastCutHalf) return;
    lastCut.copy(key);
    lastCutHalf = half;
    // Along the cut: square to the view, in meters east and north.
    section(sectionGeo, ground, controls.target.x * UNIT, -controls.target.z * UNIT, -cutDir.z, -cutDir.x, half);
  };
  let lastCutHalf = 0;

  // Tubes, shafts and stations, rebuilt when the morph moves.
  const tubes = new Object3D();
  scene.add(tubes);
  const shaftGeo = new BufferGeometry();
  const shafts = new LineSegments(shaftGeo, new LineBasicMaterial({ color: '#9fb6d6', transparent: true, opacity: 0.16, depthWrite: false }));
  scene.add(shafts);
  const stationMesh = new InstancedMesh(new SphereGeometry(0.38, 12, 8), new MeshBasicMaterial({ color: '#ffffff' }), STATIONS.length);
  scene.add(stationMesh);
  // How busy each station is: the game's weekday boardings.
  const riders = STATIONS.map((s) => Math.max(...NETWORK.stations.filter((n) => n.name === s.name).map((n) => n.riders), 1));
  const riderMid = [...riders].sort((a, b) => a - b)[Math.floor(riders.length / 2)];
  const breath = riders.map((r) => Math.min(2.2, Math.sqrt(r / riderMid)));
  STATIONS.forEach((s, i) => stationMesh.setColorAt(i, new Color(s.lines.length > 1 ? '#ffffff' : GLOW[LINES[s.lines[0]].id]).lerp(new Color('#ffffff'), 0.3).multiplyScalar(0.7)));
  const stationPos = STATIONS.map(() => new Vector3());
  /** Each global station index's place in STATIONS, which has every name once. */
  const stationOf = layout.x.map((_, g) => {
    const li = layout.lineOf[g];
    const name = LINES[li].stations[layout.global[li].indexOf(g)].name;
    return STATIONS.findIndex((s) => s.name === name);
  });

  let morph = 0;
  let routes = allRoutes(0, points);
  /** The ground under the tunnels, as much of it as the morph leaves. */
  const relief: Relief = { ground, share: 1 };
  const tubeMats = LINES.map((line) => new MeshBasicMaterial({ color: GLOW[line.id], transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }));
  // The connecting track between the green line and the blue: a thin grey line from where it leaves one tunnel to
  // where it meets the other, dipping under both (see `CONNECTORS`), where the game has its switch and branch.
  const linkMat = new MeshBasicMaterial({ color: '#b8c2d0', transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false });
  let linkMesh: Mesh | null = null;
  const ghostLabel = document.createElement('span');
  ghostLabel.className = 'net-ghost';
  labelLayer.append(ghostLabel);
  const linkLabel = document.createElement('span');
  linkLabel.textContent = text.link;
  linkLabel.className = 'net-link';
  labelLayer.append(linkLabel);
  const linkMid = new Vector3();
  /** Each end of the connecting track: a point along its tunnel, a third of the way from the station it leaves toward. */
  const linkEnds = () => CONNECTORS.map((c) => {
    const li = LINES.findIndex((l) => l.id === c.line);
    const at = (name: string) => blend(points[li][LINES[li].stations.findIndex((st) => st.name === name)], morph);
    const a = at(c.to), b = at(c.from);
    const f = 0.33;
    return { east: lerp(a.east, b.east, f), north: lerp(a.north, b.north, f), depth: lerp(a.depth, b.depth, f), y: lerp(a.y, b.y, f) };
  });
  /** How far the tubes were stretched when last built. */
  let builtStretch = 0;
  let builtSize = 0;
  function build(): void {
    routes = allRoutes(morph, points);
    relief.share = 1 - morph;
    relief.spread = size;
    builtStretch = stretch;
    builtSize = size;
    // Close by, the cars show the trains and the lights only mark them.
    (trainPoints.material as PointsMaterial).size = 2.5 * size;
    (fireflies.material as PointsMaterial).size = 2.2 * size;
    for (const child of [...tubes.children]) { (child as Mesh).geometry.dispose(); tubes.remove(child); }
    LINES.forEach((line, li) => line.routes.forEach((_, r) => {
      // The tubes along the trains' own way, dipping under what lies between stations.
      const route = routes[li][r];
      const pts: Vector3[] = [];
      for (let k = 0; k <= (route.length - 1) * 6; k++) pts.push(toScene(trainPoint(route, k / 6, 0.5, relief)));
      const curve = new CatmullRomCurve3(pts, false, 'centripetal');
      tubes.add(new Mesh(new TubeGeometry(curve, pts.length * 2, 0.32 * size, 6, false), tubeMats[li]));
    }));
    if (linkMesh) { linkMesh.geometry.dispose(); tubes.remove(linkMesh); }
    const [a, b] = linkEnds();
    const low = Math.min(a.y, b.y) - 10 * (1 - morph);
    const mid = { east: (a.east + b.east) / 2, north: (a.north + b.north) / 2, depth: 0, y: low };
    toScene(mid, linkMid);
    linkMesh = new Mesh(new TubeGeometry(new CatmullRomCurve3([toScene(a), linkMid.clone(), toScene(b)]), 24, 0.14 * size, 5, false), linkMat);
    tubes.add(linkMesh);
    const shaftPts: number[] = [];
    const lift = (stretch * (1 - morph)) / UNIT;
    STATIONS.forEach((s, i) => {
      const p = blend(s, morph);
      toScene(p, stationPos[i]);
      shaftPts.push(stationPos[i].x, stationPos[i].y, stationPos[i].z, stationPos[i].x, ground(s.geo.east, s.geo.north) * lift, stationPos[i].z);
    });
    shaftGeo.setAttribute('position', new BufferAttribute(new Float32Array(shaftPts), 3));
    shaftGeo.computeBoundingSphere();
    shafts.visible = morph < 0.9;
    const fade = 1 - morph;
    groundMat.opacity = 0.55 * fade;
    cityMat.opacity = 0.3 * fade;
    sectionMat.opacity = fade;
    surface.visible = morph < 0.98;
    surface.scale.set(1 / UNIT, Math.max(1e-3, lift), 1 / UNIT);
  }

  // Trains: points of light with fading trails, and the players online as fireflies.
  const sprite = spot();
  const trainGeo = new BufferGeometry();
  trainGeo.setAttribute('position', new BufferAttribute(new Float32Array(MAX_TRAINS * 3), 3));
  trainGeo.setAttribute('color', new BufferAttribute(new Float32Array(MAX_TRAINS * 3), 3));
  const trainPoints = new Points(trainGeo, new PointsMaterial({ size: 6, map: sprite, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  trainPoints.frustumCulled = false;
  scene.add(trainPoints);
  const trailGeo = new BufferGeometry();
  trailGeo.setAttribute('position', new BufferAttribute(new Float32Array(MAX_TRAINS * TRAIL * 6), 3));
  trailGeo.setAttribute('color', new BufferAttribute(new Float32Array(MAX_TRAINS * TRAIL * 6), 3));
  const trails = new LineSegments(trailGeo, new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  trails.frustumCulled = false;
  scene.add(trails);
  // The trains as cars: silver sides with their windows lit, the roof and ends in the line's colour (tinted per train).
  const carGeo = new BoxGeometry(1, 1, 1);
  const carTexture = carSide();
  const sideMat = new MeshBasicMaterial({ map: carTexture });
  const roofMat = new MeshBasicMaterial({ color: '#ffffff' });
  const endMat = new MeshBasicMaterial({ color: '#c8ced6' });
  const underMat = new MeshBasicMaterial({ color: '#30343a' });
  // Box faces: the ends, the roof and the underside, the two sides.
  const cars = new InstancedMesh(carGeo, [endMat, endMat, roofMat, underMat, sideMat, sideMat], MAX_TRAINS * CAR.units);
  cars.frustumCulled = false;
  cars.count = 0;
  scene.add(cars);
  const carQuat = new Quaternion();
  const carScale = new Vector3();
  const carAt = new Vector3();
  const carAhead = new Vector3();
  const carBehind = new Vector3();
  const worldUp = new Vector3(0, 1, 0);
  const carUp = new Vector3();
  const carAcross = new Vector3();
  const carBasis = new Matrix4();
  const carColour = new Color();
  const white = new Color('#ffffff');
  const ghostGeo = new BufferGeometry();
  ghostGeo.setAttribute('position', new BufferAttribute(new Float32Array(MAX_GHOSTS * 3), 3));
  const fireflies = new Points(ghostGeo, new PointsMaterial({ size: 2.2, map: sprite, color: '#ffd27a', transparent: true, blending: AdditiveBlending, depthWrite: false }));
  fireflies.frustumCulled = false;
  scene.add(fireflies);
  build();

  // Labels: the interchanges and ends always, the rest when near or pointed at.
  const always = new Set<number>();
  STATIONS.forEach((s, i) => {
    if (s.lines.length > 1) always.add(i);
    LINES.forEach((line, li) => ROUTE_STATIONS[li].forEach((seq) => {
      for (const k of [seq[0], seq[seq.length - 1]]) if (line.stations[k].name === s.name) always.add(i);
    }));
  });
  // Close by or pointed at, a label says how deep the station lies (its first line's platforms).
  const labels = STATIONS.map((s) => {
    const el = document.createElement('span');
    el.textContent = s.name;
    const depth = Math.round(depthOf(s.name, s.lines[0]));
    const small = document.createElement('small');
    small.textContent = depth > 0 ? format(text.below, { m: depth }) : depth < 0 ? format(text.above, { m: -depth }) : text.level;
    el.append(' ', small);
    labelLayer.append(el);
    return el;
  });
  let hovered = -1;
  /** Roughly how wide each label is, in pixels, for keeping them apart. */
  const labelWidth = STATIONS.map((s) => s.name.length * 6.6 + 4);
  const depthWidth = labels.map((el) => (el.lastChild?.textContent?.length ?? 0) * 5.8 + 4);
  const byPriority = STATIONS.map((_, i) => i).sort((a, b) => Number(always.has(b)) - Number(always.has(a)) || STATIONS[b].lines.length - STATIONS[a].lines.length);
  let labelOrder = byPriority;

  // Time: now, a moment scrubbed to, or a day in a minute.
  let offset = 0;
  let mode: 'live' | 'scrub' | 'day' | 'return' = 'live';
  const now = () => Date.now() / 1000;
  const setDay = (on: boolean) => {
    mode = on ? 'day' : 'return';
    dayButton.textContent = on ? text.dayStop : text.day;
    dayButton.setAttribute('aria-pressed', String(on));
  };
  timeInput.addEventListener('input', () => {
    mode = 'scrub';
    const c = stockholm(now());
    const target = stockholmEpoch(c.year, c.month, c.day, 0) + Number(timeInput.value) * 60;
    offset = target - now();
  });
  const release = () => { if (mode === 'scrub') mode = 'return'; };
  timeInput.addEventListener('change', release);
  timeInput.addEventListener('pointerup', release);
  dayButton.addEventListener('click', () => setDay(mode !== 'day'));

  let morphWanted = 0;
  const describeMorph = () => morphInput.setAttribute('aria-valuetext', `${text.schematic} ${percent.format(morphWanted)}`);
  describeMorph();
  morphInput.addEventListener('input', () => { morphWanted = Number(morphInput.value); describeMorph(); });

  // Real trains, from the relay's copy of SL's departures: on wherever there is a relay, as in the game (`?tidtabell`
  // keeps to the timetable, and `?debug` does unless `?sl`, so scripted views repeat). SL only knows now: a clock run through the day or scrubbed shows the
  // timetable, Silverpilen with it, until it is back.
  const reals = LINES.map((_, li) => new RealTrains(li));
  const search = new URLSearchParams(location.search);
  const realOn = realTrainsAvailable() && !search.has('tidtabell') && (!search.has('debug') || search.has('sl'));
  let realLoaded = false;
  let pollTimer = 0;
  const showingReal = () => realOn && realLoaded && mode === 'live' && offset === 0;
  // What the dots are, in a line: SL's trains and how they are placed, or the timetable.
  const sourceEl = q<HTMLElement>('.net-source');
  const drawSource = () => {
    sourceEl.hidden = !realTrainsAvailable();
    const line = !realOn ? text.timetableNote : mode !== 'live' || offset !== 0 ? text.onlyNow : realLoaded ? text.realNote : text.realLoading;
    if (sourceEl.textContent !== line) sourceEl.textContent = line;
  };
  const poll = async () => {
    if (!realOn) return;
    try {
      const { sightings, at } = await fetchSightings();
      reals.forEach((r, li) => r.update(sightings[li], at));
      realLoaded = true;
    } catch { /* The game's trains until SL answers. */ }
    drawSource();
    pollTimer = window.setTimeout(() => void poll(), 30_000);
  };
  if (realOn) void poll();
  drawSource();

  // The network as music: a note for every departure, pitched by line and station, panned east to west.
  let audio: { ctx: AudioContext; out: GainNode } | null = null;
  let soundOn = false;
  soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    soundButton.setAttribute('aria-pressed', String(soundOn));
    if (soundOn && !audio) {
      const ctx = new AudioContext();
      const out = ctx.createGain();
      out.gain.value = 0.22;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2200;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.37;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.38;
      out.connect(tone).connect(ctx.destination);
      tone.connect(delay).connect(feedback).connect(delay);
      delay.connect(ctx.destination);
      audio = { ctx, out };
    }
    if (audio) void (soundOn ? audio.ctx.resume() : audio.ctx.suspend());
  });
  const note = (line: number, station: number, east: number) => {
    if (!audio || !soundOn) return;
    const { ctx, out } = audio;
    const f = LINE_BASE[line] * PENTATONIC[station % 5] * (station % 10 >= 5 ? 2 : 1);
    const osc = ctx.createOscillator();
    osc.type = line === 0 ? 'sine' : line === 1 ? 'triangle' : 'sine';
    osc.frequency.value = f;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, east / 12_000));
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    osc.connect(gain).connect(pan).connect(out);
    osc.start(t);
    osc.stop(t + 2.3);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); pan.disconnect(); };
  };
  const lastStatus = new Map<string, string>();

  // Other players, as fireflies at their place in the tunnels. The relay sends everyone's pose to anyone listening.
  // The view has no pose to send, so it says it is watching (WATCH in server/pose.ts) while shown; hidden, the relay
  // lets the socket go after a minute, and it opens again when the view is shown.
  let ghosts: number[][] = [];
  /** Where each firefly was drawn this frame, for pointing at it. */
  const ghostSpots: Array<{ id: number; station: number; at: boolean; pos: Vector3 }> = [];
  /** The player under the mouse, by id. */
  let hoveredGhost: number | null = null;
  let online = 0;
  let socket: WebSocket | null = null;
  let dozing = false;
  const url = ghostUrl();
  const listen = () => {
    if (!url || socket) return;
    try {
      const ws = new WebSocket(url);
      socket = ws;
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { t?: string; p?: number[][]; n?: number };
          if (data.t === 's' && Array.isArray(data.p)) { ghosts = data.p; online = data.n ?? data.p.length; }
        } catch { /* Ignore. */ }
      };
      // Only an idle close is opened again: a spent or full relay is left alone, as before.
      ws.onclose = (event) => { if (socket === ws) socket = null; ghosts = []; online = 0; dozing = event.reason === 'idle'; };
    } catch { /* No fireflies. */ }
  };
  listen();
  const watchTimer = window.setInterval(() => {
    if (!document.hidden && socket?.readyState === WebSocket.OPEN) socket.send('{"t":"w"}');
  }, 20_000);
  const onVisible = () => { if (!document.hidden && dozing) { dozing = false; listen(); } };
  document.addEventListener('visibilitychange', onVisible);

  // The day's long exposure.
  const posterBox = q<HTMLDivElement>('.net-poster');
  const dateInput = q<HTMLInputElement>('.net-date');
  const viewButton = q<HTMLButtonElement>('.net-view');
  const imageBox = q<HTMLDivElement>('.net-poster-image');
  const shareButton = q<HTMLButtonElement>('.net-share');
  let posterView: ExposureView = 'schematic';
  let posterDay: ExposureDay = dayOf(now());
  let poster: ReturnType<typeof renderPoster> | null = null;
  const iso = (d: ExposureDay) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  const develop = () => {
    imageBox.innerHTML = `<p>${text.render}</p>`;
    imageBox.setAttribute('aria-busy', 'true');
    // Let the message paint before the work.
    window.setTimeout(() => {
      poster = renderPoster(posterDay, posterView, 1754);
      const img = document.createElement('img');
      img.alt = `${text.exposureTitle}: ${poster.title}. ${format(text.stats, { runs: numbers.format(poster.stats.runs), km: numbers.format(poster.stats.km) })}`;
      img.width = poster.canvas.width;
      img.height = poster.canvas.height;
      img.src = poster.canvas.toDataURL('image/jpeg', 0.9);
      imageBox.replaceChildren(img);
      imageBox.removeAttribute('aria-busy');
    }, 60);
  };
  // While the poster is open, everything behind it is out of reach of the keyboard and screen readers.
  const behind = () => [...root.children].filter((el) => el !== posterBox) as HTMLElement[];
  q<HTMLButtonElement>('.net-exposure').addEventListener('click', () => {
    posterBox.hidden = false;
    for (const el of behind()) el.inert = true;
    dateInput.value = iso(posterDay);
    shareButton.hidden = !('share' in navigator);
    develop();
    q<HTMLButtonElement>('.net-poster-close').focus();
  });
  dateInput.addEventListener('change', () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.value);
    if (!m) return;
    posterDay = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
    develop();
  });
  viewButton.addEventListener('click', () => {
    posterView = posterView === 'schematic' ? 'geo' : 'schematic';
    viewButton.setAttribute('aria-pressed', String(posterView === 'geo'));
    develop();
  });
  const closePoster = () => {
    posterBox.hidden = true;
    for (const el of behind()) el.inert = false;
    q<HTMLButtonElement>('.net-exposure').focus();
  };
  q<HTMLButtonElement>('.net-poster-close').addEventListener('click', closePoster);
  q<HTMLButtonElement>('.net-poster-x').addEventListener('click', closePoster);
  posterBox.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePoster(); } });
  /** A button stays disabled and says it is working while its slow job runs. */
  const busy = async (button: HTMLButtonElement, label: string, job: () => Promise<void>) => {
    const idle = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try { await job(); } finally { button.disabled = false; button.textContent = idle; }
  };
  const saveButton = q<HTMLButtonElement>('.net-save');
  saveButton.addEventListener('click', () => void busy(saveButton, text.saving, async () => {
    if (!poster) return;
    // Let the button say so before the long render.
    await new Promise((r) => window.setTimeout(r, 30));
    // The full print size for saving: A2 at about 150 dpi.
    const full = renderPoster(posterDay, posterView, 3508);
    const file = await posterFile(full, posterDay);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }));
  shareButton.addEventListener('click', () => void busy(shareButton, shareButton.textContent ?? '', async () => {
    if (!poster) return;
    const file = await posterFile(poster, posterDay);
    const data = { files: [file], title: `Tunnelbanan ${poster.title}` };
    try {
      if (navigator.canShare?.(data)) await navigator.share(data);
      else await navigator.share({ title: data.title, url: location.href });
    } catch { /* Cancelled. */ }
  }));

  // Pointing and clicking: a station's name on hover, a click to go down there.
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let downAt: { x: number; y: number } | null = null;
  const pick = (e: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // Stations are small: test against a generous sphere around each.
    let best = -1;
    let bestD = Infinity;
    const ray = raycaster.ray;
    stationPos.forEach((p, i) => {
      const d = ray.distanceSqToPoint(p);
      const reach = (1.6 + camera.position.distanceTo(p) * 0.012) ** 2;
      if (d < reach && d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  /** The firefly under the pointer, by id, or null. */
  const pickGhost = (e: PointerEvent): number | null => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    let best: number | null = null;
    let bestD = Infinity;
    for (const spot of ghostSpots) {
      const d = raycaster.ray.distanceSqToPoint(spot.pos);
      const reach = (1.2 + camera.position.distanceTo(spot.pos) * 0.01) ** 2;
      if (d < reach && d < bestD) { bestD = d; best = spot.id; }
    }
    return best;
  };
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || flight) return;
    hovered = pick(e);
    hoveredGhost = pickGhost(e);
    labelOrder = hovered >= 0 ? [hovered, ...byPriority.filter((i) => i !== hovered)] : byPriority;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : '';
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || flight) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    const i = pick(e);
    if (i < 0) return;
    // With a trip begun, a station clicked is where it goes.
    if (tripFrom.value) { tripTo.value = STATIONS[i].name; tripReady(); tripGo.focus({ preventScroll: true }); return; }
    dive(i);
  });

  // The dive: the camera drops to the station and on down into it, then the game takes over there.
  let flight: { from: Vector3; to: Vector3; lookFrom: Vector3; lookTo: Vector3; t: number; station: number; trip?: string } | null = null;
  function dive(i: number, trip?: string): void {
    if (flight || i < 0) return;
    const p = stationPos[i];
    flight = { from: camera.position.clone(), to: p.clone().add(new Vector3(0, 1.2, 4)), lookFrom: controls.target.clone(), lookTo: p.clone(), t: 0, station: i, trip };
    controls.enabled = false;
    labels[i].classList.add('is-target');
    q<HTMLElement>('.net-hint').textContent = format(text.dive, { station: STATIONS[i].name });
    // Without the flight: straight to black, and down.
    if (still) flight.t = 1;
  }
  // The keyboard's way down: every station by name.
  const pickSelect = q<HTMLSelectElement>('.net-pick select');
  const byName = new Map<string, number>();
  STATIONS.forEach((st, i) => { if (!byName.has(st.name)) byName.set(st.name, i); });
  for (const [name, i] of [...byName].sort((a, b) => a[0].localeCompare(b[0], 'sv'))) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = name;
    option.translate = false;
    pickSelect.append(option);
  }
  pickSelect.addEventListener('change', () => { if (pickSelect.value) dive(Number(pickSelect.value)); });
  // A trip: from one station to another, picked in the lists or the second by a click, and down into the first.
  const tripFrom = q<HTMLSelectElement>('.net-trip select[name="from"]');
  const tripTo = q<HTMLSelectElement>('.net-trip select[name="to"]');
  const tripGo = q<HTMLButtonElement>('.net-trip-go');
  for (const select of [tripFrom, tripTo]) {
    for (const name of [...byName.keys()].sort((a, b) => a.localeCompare(b, 'sv'))) {
      const option = new Option(name, name);
      option.translate = false;
      select.append(option);
    }
  }
  const tripReady = () => {
    tripGo.disabled = !tripFrom.value || !tripTo.value || tripFrom.value === tripTo.value;
    q<HTMLElement>('.net-hint').textContent = tripFrom.value && !tripTo.value ? text.tripHint : text.hint;
  };
  tripFrom.addEventListener('change', tripReady);
  tripTo.addEventListener('change', tripReady);
  tripGo.addEventListener('click', () => { if (!tripGo.disabled) dive(byName.get(tripFrom.value) ?? -1, tripTo.value); });
  // Escape leaves the view, unless it closed the poster first.
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && posterBox.hidden && !flight) options.close(); };
  document.addEventListener('keydown', onKey);

  q<HTMLButtonElement>('.net-close').addEventListener('click', () => options.close());

  // The view's size, read when it changes rather than every frame.
  let viewW = 1;
  let viewH = 1;
  const resize = () => {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    viewW = w;
    viewH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const matrix = new Matrix4();
  const v = new Vector3();
  // Trains burn brighter than their lines: a white-hot core in the line's colour.
  const lineColours = LINES.map((l) => new Color(GLOW[l.id]).lerp(new Color('#ffffff'), 0.35));
  const silverColour = new Color('#e8e8f2');
  let last = performance.now();
  let secondTimer = 0;

  /** Every train at time `t`, from SL where it is live, else the timetables, with Silverpilen. */
  const trainsAt = (t: number): Array<{ train: MapTrain; line: number; opacity: number }> => {
    const out: Array<{ train: MapTrain; line: number; opacity: number }> = [];
    const real = showingReal();
    LINES.forEach((_, li) => {
      const list = real ? reals[li].trains(t) : gameTrains(li, t);
      for (const train of list) out.push({ train, line: li, opacity: 1 });
    });
    if (!real) {
      const ghost = silverTrain(t);
      if (ghost) out.push({ train: ghost, line: -1, opacity: ghost.opacity });
    }
    return out;
  };

  /** Set while `__net.step` runs frames by hand, also in a hidden tab. */
  let manualDt: number | null = null;
  /** Seconds the view has been open: what the stations breathe to, at the same pace however fast the day runs. */
  let pulse = 0;
  function frame(): void {
    if (disposed) return;
    const t0 = performance.now();
    const dt = manualDt ?? Math.min(0.1, (t0 - last) / 1000);
    last = t0;
    let rate = 1;
    if (mode === 'day') {
      offset += dt * DAY_RATE;
      rate = DAY_RATE;
      if (offset > 24 * 3600) setDay(false);
    } else if (mode === 'return') {
      offset *= Math.exp(-dt * 4);
      rate = 60;
      if (Math.abs(offset) < 2) { offset = 0; mode = 'live'; }
    }
    const time = now() + offset;
    const wanted = stretchWanted();
    size = girth();
    stretch += (wanted - stretch) * Math.min(1, dt * 5);
    if (Math.abs(stretch - wanted) < 0.01) stretch = wanted;
    if (Math.abs(morph - morphWanted) > 0.001) {
      morph += (morphWanted - morph) * Math.min(1, dt * 6);
      if (Math.abs(morph - morphWanted) < 0.004) morph = morphWanted;
      build();
    } else if (Math.abs(Math.log(stretch / builtStretch)) > 0.04 || Math.abs(Math.log(size / builtSize)) > 0.08 || (stretch !== builtStretch && stretch === wanted)) build();
    placeCut();

    // The trains, with their trails a few seconds back.
    const trains = trainsAt(time);
    const trailDt = 4 * Math.min(60, Math.max(1, rate / 12));
    const past = Array.from({ length: TRAIL }, (_, k) => new Map(trainsAt(time - (k + 1) * trailDt).map((e) => [e.train.id, e])));
    const pos = trainGeo.getAttribute('position') as BufferAttribute;
    const col = trainGeo.getAttribute('color') as BufferAttribute;
    const tpos = trailGeo.getAttribute('position') as BufferAttribute;
    const tcol = trailGeo.getAttribute('color') as BufferAttribute;
    let n = 0;
    let segs = 0;
    const showCars = morph < 0.5;
    // Far out a train is drawn longer than it is, or it would be a speck: true length close by, about three times it
    // over the whole city.
    const stretchCars = Math.max(1, (size / 0.15) ** 0.6);
    let carCount = 0;
    let notes = 0;
    for (const { train, line, opacity } of trains) {
      if (n >= MAX_TRAINS) break;
      const li = line < 0 ? 0 : line;
      const p = placeTrain(routes, li, train, relief);
      toScene(p, v);
      const c = line < 0 ? silverColour : lineColours[li];
      pos.setXYZ(n, v.x, v.y + 0.25 * size, v.z);
      col.setXYZ(n, c.r * opacity, c.g * opacity, c.b * opacity);
      n++;
      if (showCars) {
        // Each unit at its own place along the track, so the train bends through the curves as it runs: measured in
        // meters along it, as the stretches between stations differ in length, and drawn from one end to the other, so
        // a unit across a station's bend keeps both ends on the track.
        const route = routes[li][train.route];
        const at = (s: number, out: Vector3) => toScene(trainPoint(route, s, train.row, relief), out);
        // A little thicker than the tube, so the car shows through its glow.
        const thick = 0.32 * size * 2.4;
        const carLength = CAR.length * stretchCars;
        carColour.copy(c).lerp(white, 0.25).multiplyScalar(opacity);
        for (let u = 0; u < CAR.units; u++) {
          const middle = (u - (CAR.units - 1) / 2) * (carLength + CAR.gap * stretchCars);
          at(alongTrack(route, train.s, middle + carLength / 2), carAhead);
          at(alongTrack(route, train.s, middle - carLength / 2), carBehind);
          carAt.addVectors(carAhead, carBehind).multiplyScalar(0.5);
          carAhead.sub(carBehind);
          const len = carAhead.length();
          if (len < 1e-6) continue;
          // Turned to the track with the roof up: the shortest turn from +x would roll each car its own way.
          carAhead.divideScalar(len);
          carAcross.crossVectors(carAhead, worldUp);
          if (carAcross.lengthSq() < 1e-8) carAcross.set(0, 0, 1);
          carAcross.normalize();
          carUp.crossVectors(carAcross, carAhead);
          carQuat.setFromRotationMatrix(carBasis.makeBasis(carAhead, carUp, carAcross));
          carScale.set(len, thick, thick);
          matrix.compose(carAt, carQuat, carScale);
          cars.setMatrixAt(carCount, matrix);
          cars.setColorAt(carCount, carColour);
          carCount++;
        }
      }
      let prev = v.clone();
      for (let k = 0; k < TRAIL; k++) {
        const e = past[k].get(train.id);
        if (!e) break;
        const q2 = toScene(placeTrain(routes, li, e.train, relief));
        if (q2.distanceTo(prev) > 12) break;
        const a0 = (1 - k / TRAIL) * 0.55 * opacity;
        const a1 = (1 - (k + 1) / TRAIL) * 0.55 * opacity;
        tpos.setXYZ(segs * 2, prev.x, prev.y + 0.25 * size, prev.z);
        tpos.setXYZ(segs * 2 + 1, q2.x, q2.y + 0.25 * size, q2.z);
        tcol.setXYZ(segs * 2, c.r * a0, c.g * a0, c.b * a0);
        tcol.setXYZ(segs * 2 + 1, c.r * a1, c.g * a1, c.b * a1);
        segs++;
        prev = q2;
      }
      // A departure plays its note.
      const was = lastStatus.get(train.id);
      lastStatus.set(train.id, train.status.kind);
      if (line >= 0 && was === 'at' && train.status.kind === 'to' && notes < 4 && mode !== 'day') {
        notes++;
        const seq = ROUTE_STATIONS[li][train.route];
        const k = Math.max(0, Math.min(seq.length - 1, Math.round(train.s)));
        note(li, seq[k], p.east);
      }
    }
    cars.count = carCount;
    cars.instanceMatrix.needsUpdate = true;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
    trainGeo.setDrawRange(0, n);
    trailGeo.setDrawRange(0, segs * 2);
    pos.needsUpdate = col.needsUpdate = tpos.needsUpdate = tcol.needsUpdate = true;

    // Stations breathe with their riders, stronger at rush hour.
    const busy = busyness(time);
    pulse += dt;
    const beat = pulse * 1.6;
    STATIONS.forEach((_, i) => {
      const s = (1 + (still ? 0 : 0.45 * busy * breath[i] * (0.5 + 0.5 * Math.sin(beat + i * 1.7))) + (i === hovered ? 0.6 : 0)) * size;
      matrix.makeScale(s, s, s).setPosition(stationPos[i]);
      stationMesh.setMatrixAt(i, matrix);
    });
    stationMesh.instanceMatrix.needsUpdate = true;

    // Fireflies: the players online, at the station they are at (its platform, halls or street), or on the track in a
    // tunnel. Only x says where someone is along the line: a hall or a street drawn by the track would float off it.
    const gpos = ghostGeo.getAttribute('position') as BufferAttribute;
    let g = 0;
    for (const row of ghosts) {
      if (g >= MAX_GHOSTS || row.length < 4) continue;
      const near = nearestStation(row[1]);
      const at = Math.abs(layout.x[near] - row[1]) < AT_STATION;
      if (at) v.copy(stationPos[stationOf[near]]);
      else {
        const p = worldToNet(row[1], morph, points);
        if (!p) continue;
        toScene(p, v);
      }
      ghostSpots[g] = { id: row[0], station: stationOf[near], at, pos: (ghostSpots[g]?.pos ?? new Vector3()).set(v.x, v.y + 0.6, v.z) };
      gpos.setXYZ(g++, v.x, v.y + 0.6, v.z);
    }
    ghostSpots.length = g;
    ghostGeo.setDrawRange(0, g);
    gpos.needsUpdate = true;
    (fireflies.material as PointsMaterial).opacity = still ? 0.85 : 0.7 + 0.3 * Math.sin(t0 / 180);

    // The dive.
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 2.6);
      const e = flight.t < 0.5 ? 2 * flight.t * flight.t : 1 - (-2 * flight.t + 2) ** 2 / 2;
      camera.position.lerpVectors(flight.from, flight.to, e);
      controls.target.lerpVectors(flight.lookFrom, flight.lookTo, Math.min(1, e * 1.4));
      camera.lookAt(controls.target);
      if (flight.t > 0.8) fade.classList.add('is-on');
      if (flight.t >= 1) {
        const name = STATIONS[flight.station].name;
        const to = flight.trip;
        flight = null;
        options.dive(name, to);
        return;
      }
    } else controls.update();

    // Labels, the hovered one first, then the interchanges and ends, each left out where it would cover another.
    const w = viewW;
    const h = viewH;
    const placed: Array<[number, number, number]> = [];
    for (const i of labelOrder) {
      const el = labels[i];
      v.copy(stationPos[i]).project(camera);
      const near = camera.position.distanceTo(stationPos[i]) < 70;
      const x = ((v.x + 1) / 2) * w + 8;
      const y = ((1 - v.y) / 2) * h - 8;
      const width = labelWidth[i] + (near || i === hovered ? depthWidth[i] : 0);
      let show = v.z < 1 && (always.has(i) || near || i === hovered);
      el.classList.toggle('is-near', near || i === hovered);
      if (show && i !== hovered) show = !placed.some(([px, py, pw]) => Math.abs(py - y) < 15 && x < px + pw && px < x + width);
      el.classList.toggle('is-on', show);
      if (!show) continue;
      placed.push([x, y, width]);
      el.style.transform = `translate(${x}px, ${y}px)`;
    }

    // The firefly under the mouse says who it is.
    const ghost = hoveredGhost === null ? undefined : ghostSpots.find((s) => s.id === hoveredGhost);
    ghostLabel.classList.toggle('is-on', !!ghost);
    if (ghost) {
      ghostLabel.textContent = format(ghost.at ? text.playerAt : text.playerNear, { station: STATIONS[ghost.station].name });
      v.copy(ghost.pos).project(camera);
      ghostLabel.style.transform = `translate(${((v.x + 1) / 2) * w + 10}px, ${((1 - v.y) / 2) * h - 22}px)`;
    }

    v.copy(linkMid).project(camera);
    const linkOn = v.z < 1 && camera.position.distanceTo(linkMid) < 40 && morph < 0.5;
    linkLabel.classList.toggle('is-on', linkOn);
    if (linkOn) linkLabel.style.transform = `translate(${((v.x + 1) / 2) * w + 8}px, ${((1 - v.y) / 2) * h + 6}px)`;

    secondTimer -= dt;
    if (secondTimer <= 0) {
      secondTimer = 0.25;
      clockEl.textContent = offset === 0 ? `${text.now} ${formatClock(time)}` : formatClock(time);
      drawSource();
      countEl.textContent = format(text.trains, { count: trains.filter((e) => e.line >= 0).length });
      playersEl.hidden = online === 0;
      if (online) playersEl.textContent = format(text.players, { count: online });
      const c = stockholm(time);
      if (mode !== 'scrub') timeInput.value = String(c.hour * 60 + c.minute);
      timeOut.textContent = formatClock(time);
      timeInput.setAttribute('aria-valuetext', formatClock(time));
    }
    renderer.render(scene, camera);
    if (manualDt === null) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // The menu that held the focus is gone: the way back takes it.
  q<HTMLButtonElement>('.net-close').focus();
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { __net: unknown }).__net = {
      camera,
      /** The orbit: `controls.target` is the point looked at, where the cut goes through. */
      controls,
      /** The trains' lights, for the launch video to make them a little larger. */
      trains: trainPoints,
      /** Runs the view for `seconds` at `rate` frames per second, right now. */
      step(seconds = 1, rate = 30) {
        manualDt = 1 / rate;
        try { for (let i = 0; i < seconds * rate && !disposed; i++) frame(); } finally { manualDt = null; }
      },
      dive: (name: string) => dive(STATIONS.findIndex((st) => st.name === name)),
      /** Where a station is in the scene, for the launch video to look at it from close by. */
      station: (name: string) => stationPos[STATIONS.findIndex((st) => st.name === name)].clone(),
      /** Where a station is on screen, in CSS pixels. */
      where(name: string) {
        const p = new Vector3().copy(stationPos[STATIONS.findIndex((st) => st.name === name)]).project(camera);
        return { x: ((p.x + 1) / 2) * viewW, y: ((1 - p.y) / 2) * viewH };
      },
    };
  }

  return () => {
    disposed = true;
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    window.clearTimeout(pollTimer);
    window.clearInterval(watchTimer);
    document.removeEventListener('visibilitychange', onVisible);
    socket?.close();
    void audio?.ctx.close();
    controls.dispose();
    for (const mesh of [...tubes.children as Mesh[], groundMesh, sectionFace, ...cityMeshes, cars]) mesh.geometry.dispose();
    carTexture.dispose();
    sectionEdge.geometry.dispose();
    groundMap.dispose();
    renderer.dispose();
    root.replaceChildren();
    root.classList.remove('net');
  };
}
