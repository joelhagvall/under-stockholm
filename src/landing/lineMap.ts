import sv from '../i18n/sv.json';
import en from '../i18n/en.json';
import { realTrainsAvailable } from '../game/sl';
import { LINES } from './lines';
import { fetchSightings, RealTrains } from './realTrains';
import { gameTrains, MAP_REACH, nextDepartures, ROUTE_STATIONS, type MapTrain } from './trains';

/**
 * A live schematic of one line at a time on the landing page, with the trains
 * you meet on entering: SL's, by the game's rule, on a line SL recently
 * reported from enough of, and the game's own timetable (a pure function of
 * the clock) on the others, before SL has answered and without a relay.
 *
 * The line is drawn straight, its trunk across the middle: each route's
 * stations one step apart, and where routes part, their branches step up and
 * down, the northern one up.
 */

// The page's own language. The departure strip stays Swedish in both, like the signs it copies.
const text = document.documentElement.lang === 'en' ? en : sv;
const POLL = 30_000;
/** Ms after the map mounts before it first asks for SL's trains. */
const FIRST_POLL = 2500;
/** The band branches spread over, in px from the top of the map. Matches .line-map's height in style.css. */
const TOP = 26;
const BOTTOM = 106;
/** Half the gap between track 1 and track 2, in px. */
const TRACK = 5;
/** Percent of the width the line spans, turnbacks included. */
const LEFT = 3;
const RIGHT = 97;
/** Trains listed under the map; the rest are counted. */
const LIST_MAX = 12;

interface Point { x: number; y: number }
/** A station on the map: its point, its branch level (0 on the trunk, below 0 up), and whether a route ends there. */
type Stop = Point & { level: number; terminal: boolean };

/** Where one line's stations and routes lie on the map. */
interface Shape {
  /** Per route, each of its stations. */
  routes: Stop[][];
  /** Percent across per station step along a route. */
  step: number;
  /** Per station, in the line's order. */
  stations: Stop[];
  /** Stations with their names on the map: the ends, where the routes part, and T-Centralen. */
  named: Set<number>;
}

function shapeOf(li: number): Shape {
  const line = LINES[li];
  const routes = ROUTE_STATIONS[li];
  const all = routes.map((_, r) => r).join(',');
  const on = line.stations.map((_, i) => routes.flatMap((seq, r) => (seq.includes(i) ? [r] : [])).join(','));
  // The trunk is what every route shares; each route's steps count from where it joins it.
  const start = routes.map((seq) => seq.findIndex((i) => on[i] === all));
  const end = routes.map((seq, r) => start[r] + seq.slice(start[r]).filter((i) => on[i] === all).length - 1);
  const side = new Map<number, -1 | 1>();
  routes.forEach((seq, r) => seq.forEach((i, k) => { if (k < start[r]) side.set(i, -1); else if (k > end[r]) side.set(i, 1); }));

  // Where routes part, the branches' ends spread evenly from up (north) to down, and a stretch that routes still
  // share runs on at the level of its end nearest the stretch before it, so one route always carries straight on.
  const level = new Map<string, number>();
  for (const d of [-1, 1] as const) {
    const north = (set: string) => {
      const ys = line.stations.flatMap((s, i) => (side.get(i) === d && on[i] === set ? [s.map[1]] : []));
      return ys.reduce((a, b) => a + b, 0) / ys.length;
    };
    const chains = routes.map((seq, r) => {
      const ks = d < 0 ? seq.slice(0, start[r]).reverse() : seq.slice(end[r] + 1);
      return ks.reduce((chain, i) => (chain[chain.length - 1] === on[i] ? chain : [...chain, on[i]]), [all]);
    });
    const kids = (set: string) => [...new Set(chains.flatMap((c) => { const p = c.indexOf(set); return p >= 0 && p + 1 < c.length ? [c[p + 1]] : []; }))].sort((a, b) => north(a) - north(b));
    const leaves = (set: string): string[] => { const k = kids(set); return k.length ? k.flatMap(leaves) : [set]; };
    const ends = leaves(all).filter((set) => set !== all);
    const endLevel = new Map(ends.map((set, n) => [set, ends.length > 1 ? (2 * n) / (ends.length - 1) - 1 : 0]));
    const place = (set: string, parent: number): void => {
      for (const kid of kids(set)) {
        const own = leaves(kid).map((leaf) => endLevel.get(leaf)!);
        const y = own.reduce((best, l) => (Math.abs(l - parent) < Math.abs(best - parent) ? l : best));
        level.set(`${d}:${kid}`, y);
        place(kid, y);
      }
    };
    place(all, 0);
  }
  const levelOf = (i: number) => (side.has(i) ? level.get(`${side.get(i)}:${on[i]}`)! : 0);
  const levels = line.stations.map((_, i) => levelOf(i));
  const y = (l: number) => (TOP + BOTTOM) / 2 + (l * (BOTTOM - TOP)) / 2;

  // Steps across, with room for the turnbacks; the end of the trunk that lies further east goes on the right.
  const uMin = Math.min(...start.map((s) => -s)) - MAP_REACH;
  const uMax = Math.max(...routes.map((seq, r) => seq.length - 1 - start[r])) + MAP_REACH;
  const [first, last] = [routes[0][start[0]], routes[0][end[0]]];
  const eastFirst = line.stations[first].map[0] > line.stations[last].map[0];
  const step = ((RIGHT - LEFT) / (uMax - uMin)) * (eastFirst ? -1 : 1);
  const x = (u: number) => (eastFirst ? RIGHT : LEFT) + (u - uMin) * step;

  const stations = line.stations.map((_, i) => {
    const r = routes.findIndex((seq) => seq.includes(i));
    return { x: x(routes[r].indexOf(i) - start[r]), y: y(levels[i]), level: levels[i], terminal: routes.some((seq) => seq[0] === i || seq[seq.length - 1] === i) };
  });
  const named = new Set<number>(stations.flatMap((s, i) => (s.terminal ? [i] : [])));
  routes.forEach((seq, r) => { named.add(seq[start[r]]); named.add(seq[end[r]]); });
  const central = line.stations.findIndex((s) => s.name === 'T-Centralen');
  if (central >= 0) named.add(central);
  return { routes: routes.map((seq) => seq.map((i) => stations[i])), step, stations, named };
}

/** Map position of a point `s` station steps along a route: x in percent, y in px. */
function point(shape: Shape, route: number, s: number): Point {
  const pts = shape.routes[route];
  const n = pts.length - 1;
  const t = Math.min(n + MAP_REACH, Math.max(-MAP_REACH, s));
  if (t <= 0) return { x: pts[0].x + t * shape.step, y: pts[0].y };
  if (t >= n) return { x: pts[n].x + (t - n) * shape.step, y: pts[n].y };
  const k = Math.floor(t);
  const f = t - k;
  return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * f, y: pts[k].y + (pts[k + 1].y - pts[k].y) * f };
}

/** The tracks as SVG: both tracks of each route, stretched to the map's width. */
function tracks(shape: Shape): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'line-tracks');
  svg.setAttribute('viewBox', '0 0 100 132');
  svg.setAttribute('preserveAspectRatio', 'none');
  shape.routes.forEach((pts, r) => {
    for (const side of [-1, 1]) {
      const path = document.createElementNS(ns, 'polyline');
      const coords: string[] = [];
      for (let s = -MAP_REACH * 0.8; s <= pts.length - 1 + MAP_REACH * 0.8; s += 0.25) {
        const p = point(shape, r, s);
        coords.push(`${p.x.toFixed(2)},${(p.y + side * TRACK).toFixed(2)}`);
      }
      path.setAttribute('points', coords.join(' '));
      svg.append(path);
    }
  });
  return svg;
}

/** A row of the hero departure strip, as on the boards over the platforms: route number, where to, and when. */
type StripRow = [line: string, destination: string, when: string];

/**
 * What the hero departure strip says for a line without departures to show: the routes that start at its first
 * station and where they go. The blue line's matches the static HTML.
 */
function stripDefault(li: number): StripRow[] {
  const line = LINES[li];
  return line.routes.filter((_, r) => ROUTE_STATIONS[li][r][0] === 0).map((r) => [r.number, r.outbound, '']);
}

function formatWhen(seconds: number): string {
  return seconds <= 45 ? text.lineMap.depNow : text.lineMap.depMin.replace('{min}', String(Math.ceil(seconds / 60)));
}

/** One row of the strip; the spaces between the cells keep it readable as text. */
function stripRow(row: StripRow): HTMLElement {
  const e = el('span', 'menu-board-row');
  row.forEach((cell, i) => e.append(...(i ? [' '] : []), el('span', '', cell)));
  return e;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = content;
  return e;
}

export function mountLineMap(root: HTMLElement): void {
  const map = root.querySelector<HTMLElement>('.line-map')!;
  const list = root.querySelector<HTMLUListElement>('.line-trains')!;
  const note = root.querySelector<HTMLElement>('.line-note')!;
  const lineButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-line]')];
  // The dot-matrix strip in the hero shows the next departures from the shown line's first station (Kungsträdgården, Ropsten, Hässelby strand).
  const strip = document.getElementById('departures');
  // Without the relay there are no real trains: the map keeps to the timetable and never asks.
  const relay = realTrainsAvailable();

  const shapes = new Map<number, Shape>();
  const markers = new Map<string, HTMLElement>();
  const reals = LINES.map((_, li) => new RealTrains(li));
  let line = 0;
  let shape = shapeOf(0);
  let loaded = false;
  let failed = false;
  let inFlight = false;
  let listShown = '';
  let stripShown = '';
  let lastList = 0;

  // Runs only while the map is on screen: scrolled past, or under the game, it rests.
  let onScreen = true;
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(root);
  const visible = () => !document.hidden && onScreen;
  // With less motion asked for, the trains step once a second instead of gliding.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fill = (template: string, station: number) => template.replace('{station}', LINES[line].stations[station].name);

  function describe(t: MapTrain): string {
    const stations = ROUTE_STATIONS[line][t.route];
    switch (t.status.kind) {
      case 'at': return fill(text.lineMap.at, t.status.station);
      case 'to': return fill(text.lineMap.to, t.status.station);
      case 'turnback': return fill(text.lineMap.beyond, t.status.station);
      case 'away': return fill(text.lineMap.beyond, stations[stations.length - 1]);
    }
  }

  /** The line's tracks, stations and names; trains are drawn over them every frame. */
  function drawLine(): void {
    shape = shapes.get(line) ?? shapeOf(line);
    shapes.set(line, shape);
    for (const m of markers.values()) m.remove();
    markers.clear();
    const named = [...shape.named].sort((a, b) => shape.stations[a].x - shape.stations[b].x);
    // Where routes part and none of them carries straight on, the side (-1 left, 1 right) the fork opens to, else 0.
    const fork = (p: Stop): number => {
      const next = shape.routes.flatMap((pts) => {
        const k = pts.indexOf(p);
        return k < 0 ? [] : [pts[k - 1], pts[k + 1]].filter((n): n is Stop => n !== undefined);
      });
      const opens = (d: number) => {
        const out = next.filter((n) => Math.sign(n.x - p.x) === d);
        return out.some((n) => n.level !== p.level) && out.every((n) => n.level !== p.level);
      };
      return opens(-1) ? -1 : opens(1) ? 1 : 0;
    };
    let trunkAbove = false;
    const parts: Element[] = [tracks(shape)];
    shape.stations.forEach((p) => {
      const marker = el('div', 'line-station');
      marker.style.left = `${p.x}%`;
      marker.style.top = `${p.y}px`;
      parts.push(marker);
    });
    for (const i of named) {
      const p = shape.stations[i];
      const label = LINES[line].stations[i].name;
      // Where routes part, the name sits in the empty fork between the branches, clear of the switch.
      const side = p.level === 0 && !p.terminal ? fork(p) : 0;
      if (side) {
        const name = el('span', `line-station-name is-fork${side < 0 ? ' is-fork-left' : ''}`, label);
        name.style.left = `calc(${p.x + side * 0.5 * Math.abs(shape.step)}% ${side < 0 ? '-' : '+'} 4px)`;
        name.style.top = `${p.y - 8}px`;
        parts.push(name);
        continue;
      }
      // Branches keep their names on the outside; along the trunk they take turns above and below.
      if (p.level === 0) trunkAbove = !trunkAbove;
      const above = p.level === 0 ? trunkAbove : p.level < 0;
      const align = p.x < 12 ? ' is-start' : p.x > 88 ? ' is-end' : '';
      // On narrow screens only the ends out on the branches and at the edges keep their names.
      const outer = p.terminal && (p.level !== 0 || p.x < 10 || p.x > 90);
      const name = el('span', `line-station-name ${above ? 'is-above' : 'is-below'}${align}${outer ? ' is-outer' : ''}`, label);
      name.style.left = `${p.x}%`;
      name.style.top = `${p.y + (above ? -26 : 10)}px`;
      parts.push(name);
    }
    map.replaceChildren(...parts);
    root.dataset.line = LINES[line].id;
    for (const b of lineButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.line) === line));
    listShown = '';
    lastList = 0;
  }

  /** Whether the shown line follows SL right now; if not, it keeps to the game's timetable. */
  const real = (now: number): boolean => relay && reals[line].live(now);

  function trains(now: number): MapTrain[] {
    return real(now) ? reals[line].trains(now) : gameTrains(line, now);
  }

  function drawMarkers(current: MapTrain[]): void {
    const seen = new Set<string>();
    for (const t of current) {
      seen.add(t.id);
      let m = markers.get(t.id);
      if (!m) {
        m = el('div', 'line-train', t.line);
        markers.set(t.id, m);
        map.append(m);
      }
      const p = point(shape, t.route, t.s);
      m.style.left = `${p.x}%`;
      m.style.top = `${p.y + (t.row * 2 - 1) * TRACK}px`;
      m.classList.toggle('is-open', t.doorsOpen);
    }
    for (const [id, m] of markers) if (!seen.has(id)) { m.remove(); markers.delete(id); }
  }

  function drawList(current: MapTrain[]): void {
    const rows = [...current].sort((a, b) => Math.round(a.row) - Math.round(b.row) || (a.row < 0.5 ? b.s - a.s : a.s - b.s) || a.route - b.route);
    const lines = rows.slice(0, LIST_MAX).map((t) => [t.line, t.destination ?? text.lineMap.turningBack, describe(t)]);
    const more = rows.length - lines.length;
    let empty = '';
    if (!lines.length) empty = real(Date.now() / 1000) ? text.lineMap.noRealTrains : text.lineMap.noGameTrains;
    const key = JSON.stringify([line, lines, more, empty]);
    if (key === listShown) return;
    listShown = key;
    list.replaceChildren(
      ...lines.map(([badge, destination, where]) => {
        const li = el('li', 'line-train-row');
        const name = el('span', 'line-train-destination', destination);
        // Station names are names: a translating browser must leave them alone.
        name.translate = false;
        li.append(el('span', 'line-train-badge', badge), name, el('span', 'line-train-where', where));
        return li;
      }),
    );
    if (more > 0) list.append(el('li', 'line-train-row is-empty', text.lineMap.more.replace('{count}', String(more))));
    if (empty) list.append(el('li', 'line-train-row is-empty', empty));
  }

  function drawNote(now: number): void {
    const live = real(now);
    root.classList.toggle('is-real', live);
    const next = live ? text.lineMap.realNote : failed ? text.lineMap.error : relay && !loaded ? text.lineMap.loading : text.lineMap.gameNote;
    if (note.textContent !== next) note.textContent = next;
  }

  function drawStrip(now: number): void {
    if (!strip) return;
    const deps = real(now) ? reals[line].nextDepartures(now, 0) : nextDepartures(now, line, 0);
    const rows: StripRow[] = deps.length ? deps.map((d) => [d.line, d.destination, formatWhen(d.seconds)]) : stripDefault(line);
    const key = JSON.stringify(rows);
    if (key !== stripShown) {
      stripShown = key;
      strip.replaceChildren(...rows.flatMap((r, i) => (i ? [' ', stripRow(r)] : [stripRow(r)])));
    }
    strip.classList.remove('is-pending');
  }

  async function poll(): Promise<void> {
    if (inFlight || !visible()) return;
    inFlight = true;
    try {
      // One fetch of the relay's copy feeds every line, so switching lines needs no wait.
      const { sightings, at } = await fetchSightings();
      reals.forEach((r, li) => r.update(sightings[li], at));
      loaded = true;
      failed = false;
    } catch (err) {
      console.warn(err);
      failed = true;
    } finally {
      inFlight = false;
      lastList = 0;
    }
  }

  for (const b of lineButtons) b.addEventListener('click', () => { line = Number(b.dataset.line); drawLine(); });

  // Markers move every frame; the text list only changes once a second.
  function frame(ms: number): void {
    if (!visible()) {
      // Paused while the game runs or the tab is hidden; check back now and then.
      window.setTimeout(() => requestAnimationFrame(frame), 1000);
      return;
    }
    const current = trains(Date.now() / 1000);
    if (!still) drawMarkers(current);
    if (!lastList || ms - lastList > 1000) {
      lastList = ms;
      if (still) drawMarkers(current);
      drawList(current);
      drawStrip(Date.now() / 1000);
      drawNote(Date.now() / 1000);
    }
    requestAnimationFrame(frame);
  }

  drawLine();
  // SL is asked once the page has settled, so the question never holds up its first paint.
  if (relay) {
    window.setTimeout(() => {
      void poll();
      window.setInterval(poll, POLL);
    }, FIRST_POLL);
  }
  root.classList.add('is-ready');
  requestAnimationFrame(frame);
}
