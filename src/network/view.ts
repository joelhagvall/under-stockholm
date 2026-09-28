import './network.css';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, FogExp2, InstancedMesh,
  LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial,
  Raycaster, Scene, SphereGeometry, SRGBColorSpace, TubeGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import sv from '../i18n/sv.json';
import en from '../i18n/en.json';
import { busyness, formatClock, stockholm, stockholmEpoch } from '../game/clock';
import { NETWORK } from '../game/line';
import { ghostUrl } from '../game/relay';
import { realTrainsAvailable } from '../game/sl';
import { LINES } from '../landing/lines';
import { fetchSightings, RealTrains } from '../landing/realTrains';
import { gameTrains, layout, ROUTE_STATIONS, type MapTrain } from '../landing/trains';
import { allRoutes, blend, LINE_POINTS, lerp, placeTrain, silverTrain, STATIONS, type NetPoint } from './data';
import { dayOf, posterFile, renderPoster, type ExposureDay, type ExposureView } from './exposure';
import { project, WATER } from './geo';

/**
 * The whole network at once: every line a glowing tube at its real depth under a dark Stockholm, every train a
 * point of light with a fading trail, from the same timetables as the game (or SL's real trains). A time scrubber,
 * a morph from geography to the line map, a note per departure, other players as fireflies, the day's long
 * exposure, and a click on a station to go down there. Loaded on its own with `import()`, like the game.
 */

const text = (document.documentElement.lang === 'en' ? en : sv).network;
const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));

/** Meters per scene unit. */
const UNIT = 100;
/** Depth is exaggerated, so the network reads as roots under the city. */
const DEPTH_X = 20;
/** Samples back in time per train for its trail. */
const TRAIL = 8;
const MAX_TRAINS = 420;
const MAX_GHOSTS = 64;
const GLOW: Record<string, string> = { blue: '#4696ff', red: '#ff465f', green: '#3cd778' };
/** A day in a minute. */
const DAY_RATE = 1440;
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const LINE_BASE = [220, 293.66, 329.63];

export interface NetworkOptions {
  /** Go down to a station: start the game there. */
  dive(station: string): void;
  close(): void;
}

const toScene = (p: NetPoint, out = new Vector3()) => out.set(p.east / UNIT, -(p.depth * DEPTH_X) / UNIT, -p.north / UNIT);

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

/** The ground: land, water and a faint kilometer grid, seen through. */
function groundTexture(reach: number): CanvasTexture {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const px = (m: number) => ((m + reach) / (2 * reach)) * size;
  g.fillStyle = '#121a26';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(160, 190, 230, 0.07)';
  g.lineWidth = 1;
  for (let m = -reach; m <= reach; m += 1000) {
    g.beginPath(); g.moveTo(px(m), 0); g.lineTo(px(m), size); g.stroke();
    g.beginPath(); g.moveTo(0, px(m)); g.lineTo(size, px(m)); g.stroke();
  }
  g.fillStyle = '#050b16';
  for (const poly of WATER) {
    g.beginPath();
    poly.forEach(([lat, lon], i) => {
      const p = project(lat, lon);
      if (i) g.lineTo(px(p.east), px(-p.north)); else g.moveTo(px(p.east), px(-p.north));
    });
    g.closePath();
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Where a point along world x in the game lies on the network: between the two stations of its tunnel. */
function worldToNet(x: number, morph: number): NetPoint | null {
  const pointOf = (g: number) => {
    const li = layout.lineOf[g];
    const local = layout.global[li].indexOf(g);
    return blend(LINE_POINTS[li][local], morph);
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
    return { east: lerp(a.east, b.east, f), north: lerp(a.north, b.north, f), depth: lerp(a.depth, b.depth, f) };
  }
  let near = 0;
  layout.x.forEach((sx, i) => { if (Math.abs(sx - x) < Math.abs(layout.x[near] - x)) near = i; });
  return Math.abs(layout.x[near] - x) < 800 ? pointOf(near) : null;
}

export async function mountNetwork(root: HTMLElement, options: NetworkOptions): Promise<() => void> {
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
      <label class="net-time"><span>${text.time}</span><input type="range" min="0" max="1439" step="1"><output></output></label>
      <div class="net-buttons">
        <button type="button" class="net-day">${text.day}</button>
        <button type="button" class="net-toggle net-sound" aria-pressed="false">${text.sound}</button>
        <button type="button" class="net-toggle net-real" aria-pressed="false" hidden>${text.real}</button>
        <button type="button" class="net-exposure">${text.exposure}</button>
      </div>
      <label class="net-morph"><span>${text.geo}</span><input type="range" min="0" max="1" step="0.01" value="0" aria-label="${text.morph}"><span>${text.schematic}</span></label>
      <label class="net-pick"><span>${text.pick}</span><select name="station"><option value="">${text.pickNone}</option></select></label>
      <p class="net-hint" role="status">${text.hint}</p>
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
  const realButton = q<HTMLButtonElement>('.net-real');
  const morphInput = q<HTMLInputElement>('.net-morph input');
  const fade = q<HTMLDivElement>('.net-fade');
  // Players who ask for less motion get no camera flight, no breathing stations and no flickering fireflies.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const numbers = new Intl.NumberFormat(document.documentElement.lang || 'sv');
  const percent = new Intl.NumberFormat(document.documentElement.lang || 'sv', { style: 'percent' });

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new Scene();
  scene.background = new Color('#04060a');
  scene.fog = new FogExp2('#04060a', 0.0028);
  const camera = new PerspectiveCamera(50, 1, 0.5, 2000);
  camera.position.set(-40, 150, 185);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-10, -4, 0);
  controls.enableDamping = !still;
  // The arrow keys move the view once the canvas has focus.
  controls.listenToKeyEvents(canvas);
  controls.maxDistance = 520;
  controls.minDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.update();

  // The ground, seen through: land, water, a grid.
  const REACH = 26_000;
  const groundMat = new MeshBasicMaterial({ map: groundTexture(REACH), transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide });
  const ground = new Mesh(new PlaneGeometry((2 * REACH) / UNIT, (2 * REACH) / UNIT), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.renderOrder = -1;
  scene.add(ground);

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

  let morph = 0;
  let routes = allRoutes(0);
  function build(): void {
    routes = allRoutes(morph);
    for (const child of [...tubes.children]) { (child as Mesh).geometry.dispose(); tubes.remove(child); }
    LINES.forEach((line, li) => line.routes.forEach((_, r) => {
      const pts = routes[li][r].map((p) => toScene(p));
      const curve = new CatmullRomCurve3(pts, false, 'centripetal');
      const mat = new MeshBasicMaterial({ color: GLOW[line.id], transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false });
      tubes.add(new Mesh(new TubeGeometry(curve, pts.length * 10, 0.32, 6, false), mat));
    }));
    const shaftPts: number[] = [];
    STATIONS.forEach((s, i) => {
      toScene(blend(s, morph), stationPos[i]);
      shaftPts.push(stationPos[i].x, stationPos[i].y, stationPos[i].z, stationPos[i].x, 0, stationPos[i].z);
    });
    shaftGeo.setAttribute('position', new BufferAttribute(new Float32Array(shaftPts), 3));
    shaftGeo.computeBoundingSphere();
    groundMat.opacity = 0.55 * (1 - morph);
    ground.visible = morph < 0.98;
    shafts.visible = morph < 0.9;
  }
  build();

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
  const ghostGeo = new BufferGeometry();
  ghostGeo.setAttribute('position', new BufferAttribute(new Float32Array(MAX_GHOSTS * 3), 3));
  const fireflies = new Points(ghostGeo, new PointsMaterial({ size: 2.2, map: sprite, color: '#ffd27a', transparent: true, blending: AdditiveBlending, depthWrite: false }));
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // Labels: the interchanges and ends always, the rest when near or pointed at.
  const always = new Set<number>();
  STATIONS.forEach((s, i) => {
    if (s.lines.length > 1) always.add(i);
    LINES.forEach((line, li) => ROUTE_STATIONS[li].forEach((seq) => {
      for (const k of [seq[0], seq[seq.length - 1]]) if (line.stations[k].name === s.name) always.add(i);
    }));
  });
  const labels = STATIONS.map((s) => {
    const el = document.createElement('span');
    el.textContent = s.name;
    labelLayer.append(el);
    return el;
  });
  let hovered = -1;
  /** Roughly how wide each label is, in pixels, for keeping them apart. */
  const labelWidth = STATIONS.map((s) => s.name.length * 6.6 + 4);
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

  // Real trains, from the relay's copy of SL's departures: on wherever there is a relay, as in the game (`?debug` keeps
  // to the timetable, so scripted views repeat). SL only knows now: a clock run through the day or scrubbed shows the
  // timetable, Silverpilen with it, until it is back.
  const reals = LINES.map((_, li) => new RealTrains(li));
  let realOn = realTrainsAvailable() && !new URLSearchParams(location.search).has('debug');
  let realLoaded = false;
  let pollTimer = 0;
  realButton.hidden = !realTrainsAvailable();
  realButton.setAttribute('aria-pressed', String(realOn));
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
  realButton.addEventListener('click', () => {
    realOn = !realOn;
    realButton.setAttribute('aria-pressed', String(realOn));
    window.clearTimeout(pollTimer);
    if (realOn) { setDay(false); offset = 0; mode = 'live'; void poll(); }
    drawSource();
  });
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
  let ghosts: number[][] = [];
  let online = 0;
  let socket: WebSocket | null = null;
  const url = ghostUrl();
  if (url) {
    try {
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { t?: string; p?: number[][]; n?: number };
          if (data.t === 's' && Array.isArray(data.p)) { ghosts = data.p; online = data.n ?? data.p.length; }
        } catch { /* Ignore. */ }
      };
    } catch { /* No fireflies. */ }
  }

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
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || flight) return;
    hovered = pick(e);
    labelOrder = hovered >= 0 ? [hovered, ...byPriority.filter((i) => i !== hovered)] : byPriority;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : '';
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || flight) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    const i = pick(e);
    if (i >= 0) dive(i);
  });

  // The dive: the camera drops to the station and on down into it, then the game takes over there.
  let flight: { from: Vector3; to: Vector3; lookFrom: Vector3; lookTo: Vector3; t: number; station: number } | null = null;
  function dive(i: number): void {
    if (flight) return;
    const p = stationPos[i];
    flight = { from: camera.position.clone(), to: p.clone().add(new Vector3(0, 1.2, 4)), lookFrom: controls.target.clone(), lookTo: p.clone(), t: 0, station: i };
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
  let disposed = false;

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
    if (Math.abs(morph - morphWanted) > 0.001) {
      morph += (morphWanted - morph) * Math.min(1, dt * 6);
      if (Math.abs(morph - morphWanted) < 0.004) morph = morphWanted;
      build();
    }

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
    let notes = 0;
    for (const { train, line, opacity } of trains) {
      if (n >= MAX_TRAINS) break;
      const li = line < 0 ? 0 : line;
      const p = placeTrain(routes, li, train);
      toScene(p, v);
      const c = line < 0 ? silverColour : lineColours[li];
      pos.setXYZ(n, v.x, v.y + 0.25, v.z);
      col.setXYZ(n, c.r * opacity, c.g * opacity, c.b * opacity);
      n++;
      let prev = v.clone();
      for (let k = 0; k < TRAIL; k++) {
        const e = past[k].get(train.id);
        if (!e) break;
        const q2 = toScene(placeTrain(routes, li, e.train));
        if (q2.distanceTo(prev) > 12) break;
        const a0 = (1 - k / TRAIL) * 0.55 * opacity;
        const a1 = (1 - (k + 1) / TRAIL) * 0.55 * opacity;
        tpos.setXYZ(segs * 2, prev.x, prev.y + 0.25, prev.z);
        tpos.setXYZ(segs * 2 + 1, q2.x, q2.y + 0.25, q2.z);
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
    trainGeo.setDrawRange(0, n);
    trailGeo.setDrawRange(0, segs * 2);
    pos.needsUpdate = col.needsUpdate = tpos.needsUpdate = tcol.needsUpdate = true;

    // Stations breathe with their riders, stronger at rush hour.
    const busy = busyness(time);
    pulse += dt;
    const beat = pulse * 1.6;
    STATIONS.forEach((_, i) => {
      const s = 1 + (still ? 0 : 0.45 * busy * breath[i] * (0.5 + 0.5 * Math.sin(beat + i * 1.7))) + (i === hovered ? 0.6 : 0);
      matrix.makeScale(s, s, s).setPosition(stationPos[i]);
      stationMesh.setMatrixAt(i, matrix);
    });
    stationMesh.instanceMatrix.needsUpdate = true;

    // Fireflies: the players online, at their place in the tunnels.
    const gpos = ghostGeo.getAttribute('position') as BufferAttribute;
    let g = 0;
    for (const row of ghosts) {
      if (g >= MAX_GHOSTS || row.length < 4) continue;
      const p = worldToNet(row[1], morph);
      if (!p) continue;
      toScene(p, v);
      const drift = still ? 0 : Math.sin(t0 / 400 + row[0]) * 0.4;
      gpos.setXYZ(g++, v.x + drift, v.y + 1 + (still ? 0 : Math.cos(t0 / 530 + row[0]) * 0.4), v.z);
    }
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
        flight = null;
        options.dive(name);
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
      const width = labelWidth[i];
      let show = v.z < 1 && (always.has(i) || near || i === hovered);
      if (show && i !== hovered) show = !placed.some(([px, py, pw]) => Math.abs(py - y) < 15 && x < px + pw && px < x + width);
      el.classList.toggle('is-on', show);
      if (!show) continue;
      placed.push([x, y, width]);
      el.style.transform = `translate(${x}px, ${y}px)`;
    }

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
      /** Runs the view for `seconds` at `rate` frames per second, right now. */
      step(seconds = 1, rate = 30) {
        manualDt = 1 / rate;
        try { for (let i = 0; i < seconds * rate && !disposed; i++) frame(); } finally { manualDt = null; }
      },
      dive: (name: string) => dive(STATIONS.findIndex((st) => st.name === name)),
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
    socket?.close();
    void audio?.ctx.close();
    controls.dispose();
    renderer.dispose();
    root.replaceChildren();
    root.classList.remove('net');
  };
}
