import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  type Scene,
  type Vector3,
} from 'three';
import { hash01, season, stockholm, sunElevation } from './clock';
import { fetchWeather, isWet, seasonalWeather, type WeatherKind, type WeatherState } from './weatherFeed';
import { isCold } from './calendar';
import { glowTexture } from './gfx/textures';
import { loopNoise, Spatial, type AudioOut } from './sfx';
import type { StationInfo } from './world/station';

/**
 * What is happening up on the street, out of the exit: the
 * real Stockholm weather (from Open-Meteo, no key needed, through the relay's
 * shared copy when there is one) or a seasonal guess
 * when offline, and daylight from the sun's actual position. Snow drifts in
 * over the top steps, rain blows in past the doors, and wet feet leave prints
 * across the ticket hall.
 */

export { isWet, seasonalWeather, type WeatherKind, type WeatherState } from './weatherFeed';

/** How light it is up on the street, from 0 at night to 1 by day. */
export function daylight(epoch: number): number {
  return Math.min(1, Math.max(0, (sunElevation(epoch) + 4) / 12));
}


/**
 * Where falling snow and rain land, `d` meters in from the doorway: the flight up to the street out in the cut beyond
 * it (`d` below 0), the landing, the flight down, the hall floor.
 */
function floorAt(e: StationInfo['exit'], d: number, z: number): number {
  const hall = e.sillY - 3.4;
  if (d < 0 && e.cut > 0) return e.sillY + (e.top - e.sillY) * Math.min(1, -d / e.cut);
  return Math.abs(z) > 2.5 ? hall : d < 6 ? e.sillY : hall + 3.4 * Math.max(0, 1 - (d - 6) / 7);
}

const RAIN = 260;
const SNOW = 420;
const PRINTS = 44;
const MIST = 36;
const LEAVES = 34;
const LEAF_COLORS = [0xc8641e, 0xe0a526, 0x8a4b1f, 0xb5391f, 0xd98b2b, 0x6e5a1e];

function leafTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  // A maple-ish leaf: five lobes around the stalk.
  for (let k = 0; k <= 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
    const r = k % 2 ? 12 : 28;
    ctx.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r);
  }
  ctx.fill();
  ctx.fillRect(31, 34, 2, 28);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function footprintTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(32, 44, 20, 36, 0, 0, Math.PI * 2);
  ctx.ellipse(32, 104, 16, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Weather {
  state: WeatherState;
  private readonly rain: LineSegments;
  private readonly snow: Points;
  private readonly prints: InstancedMesh;
  private readonly drift: Mesh;
  private readonly mist: Points;
  private readonly mistData = new Float32Array(MIST * 3);
  private readonly leaves: InstancedMesh;
  private readonly rainData: Float32Array;
  private readonly snowData: Float32Array;
  private readonly snowVel: Float32Array;
  private readonly dummy = new Object3D();
  private station = -1;
  private patter: Spatial | null = null;
  private refresh = 0;

  constructor(scene: Scene, private readonly stations: StationInfo[], forced: string | null, now: number) {
    this.state = seasonalWeather(now);
    const kinds: WeatherKind[] = ['clear', 'cloudy', 'rain', 'snow', 'sleet'];
    if (forced && kinds.includes(forced as WeatherKind)) {
      const kind = forced as WeatherKind;
      this.state = { kind, intensity: isWet({ kind } as WeatherState) ? 0.8 : 0, temperature: kind === 'snow' ? -4 : 8, source: 'debug' };
    } else void this.poll();

    this.rainData = new Float32Array(RAIN * 6);
    const rainGeo = new BufferGeometry();
    rainGeo.setAttribute('position', new BufferAttribute(this.rainData, 3).setUsage(DynamicDrawUsage));
    this.rain = new LineSegments(rainGeo, new LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    this.snowData = new Float32Array(SNOW * 3);
    this.snowVel = new Float32Array(SNOW * 3);
    const snowGeo = new BufferGeometry();
    snowGeo.setAttribute('position', new BufferAttribute(this.snowData, 3).setUsage(DynamicDrawUsage));
    this.snow = new Points(snowGeo, new PointsMaterial({ size: 0.07, map: glowTexture(), color: 0xf4f8ff, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);

    this.prints = new InstancedMesh(new PlaneGeometry(0.13, 0.28), new MeshBasicMaterial({ map: footprintTexture(), color: 0x0b0d10, transparent: true, opacity: 0.3, depthWrite: false }), PRINTS);
    this.prints.frustumCulled = false;
    this.prints.visible = false;
    this.prints.renderOrder = 1;
    scene.add(this.prints);

    const mistGeo = new BufferGeometry();
    mistGeo.setAttribute('position', new BufferAttribute(this.mistData, 3).setUsage(DynamicDrawUsage));
    this.mist = new Points(mistGeo, new PointsMaterial({ size: 3.4, map: glowTexture(), color: 0xeef2f5, transparent: true, opacity: 0.22, depthWrite: false }));
    this.mist.frustumCulled = false;
    this.mist.visible = false;
    this.mist.name = 'stair-mist';
    scene.add(this.mist);

    this.leaves = new InstancedMesh(new PlaneGeometry(0.16, 0.16), new MeshBasicMaterial({ map: leafTexture(), transparent: true, alphaTest: 0.4, depthWrite: false }), LEAVES);
    this.leaves.frustumCulled = false;
    this.leaves.visible = false;
    this.leaves.renderOrder = 1;
    this.leaves.name = 'autumn-leaves';
    for (let i = 0; i < LEAVES; i++) this.leaves.setColorAt(i, new Color(LEAF_COLORS[i % LEAF_COLORS.length]).multiplyScalar(0.7));
    scene.add(this.leaves);

    this.drift = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0xe9eef3, transparent: true, opacity: 0.85 }));
    this.drift.rotation.x = -Math.PI / 2;
    this.drift.visible = false;
    scene.add(this.drift);
  }

  private async poll(): Promise<void> {
    const live = await fetchWeather();
    if (live) this.state = live;
  }

  get wet(): boolean {
    return isWet(this.state);
  }

  /** Umbrellas come out in wet weather, and all through December. */
  umbrellas(epoch: number): boolean {
    return this.wet || stockholm(epoch).month === 12;
  }

  update(dt: number, time: number, playerHall: number | null, out: AudioOut | null): void {
    this.refresh += dt;
    if (this.refresh > 1200 && this.state.source === 'live') { this.refresh = 0; void this.poll(); }
    // The street's lit windows and lamp come on as it gets dark; snow lies on it while it snows.
    const lights = 1 - daylight(time);
    const snow = this.state.kind === 'snow' ? 1 : this.state.kind === 'sleet' ? 0.5 : 0;
    for (const s of this.stations) {
      const street = s.exit.street;
      if (street?.snow) {
        const m = street.snow.material as MeshBasicMaterial;
        m.opacity = snow * 0.92;
        m.color.setScalar(0.3 + 0.7 * (1 - lights));
      }
      if (street?.windows) (street.windows.material as MeshBasicMaterial).opacity = Math.min(1, lights * 1.4);
    }

    const station = playerHall === null ? null : this.stations[playerHall];
    const kind = this.state.kind;
    const showRain = station !== null && (kind === 'rain' || kind === 'sleet');
    const showSnow = station !== null && (kind === 'snow' || kind === 'sleet');
    this.rain.visible = showRain;
    this.snow.visible = showSnow;
    this.prints.visible = station !== null && this.wet;
    this.drift.visible = station !== null && kind === 'snow';
    // Warm tunnel air meets the cold at the top of the stairs.
    this.mist.visible = station !== null && isCold(this.state.temperature);
    this.leaves.visible = station !== null && season(time) === 'autumn';
    if (station && station.index !== this.station) {
      this.station = station.index;
      this.layPrints(station);
      this.layLeaves(station);
      this.seed(station);
    }
    if (station && this.mist.visible) this.driftMist(dt, time, station);
    if (station) {
      const e = station.exit;
      const inward = -e.dir;
      const k = this.state.intensity;
      if (showRain) {
        for (let i = 0; i < RAIN; i++) {
          const o = i * 6;
          let y = this.rainData[o + 1] - dt * 9;
          let x = this.rainData[o];
          let z = this.rainData[o + 2];
          if (y < floorAt(e, (x - e.x) * inward, z) || i / RAIN > k) {
            // Down through the open top of the stairs, or blown in at the doorway.
            const above = Math.random() < 0.7;
            y = above ? e.top - Math.random() * 0.6 : e.sillY + Math.random() * e.height;
            x = e.x + inward * (above ? Math.random() * (e.open + e.cut) - e.cut : 0.05 + Math.random() * 1.6 * Math.random());
            z = (Math.random() * 2 - 1) * e.halfWidth;
          }
          x += inward * dt * 0.8;
          this.rainData.set([x, y, z, x - inward * 0.03, y + 0.28, z], o);
        }
        this.rain.geometry.attributes.position.needsUpdate = true;
      }
      if (showSnow) {
        for (let i = 0; i < SNOW; i++) {
          const o = i * 3;
          const alive = i / SNOW <= k;
          let x = this.snowData[o], y = this.snowData[o + 1], z = this.snowData[o + 2];
          const d = (x - e.x) * inward;
          if (!alive || y < floorAt(e, d, z) || d > e.open + 1 || d < -e.cut - 1) {
            // Mostly down through the open top of the stairs, some blown in at the doorway.
            const above = Math.random() < 0.7;
            y = above ? e.top + Math.random() * 0.5 : e.sillY + Math.random() * e.height;
            x = e.x + inward * (above ? Math.random() * (e.open + e.cut) - e.cut : 0.05);
            z = (Math.random() * 2 - 1) * e.halfWidth;
            this.snowVel[o] = inward * (above ? (Math.random() - 0.3) * 0.5 : 0.4 + Math.random() * 1.4);
            this.snowVel[o + 1] = -(0.45 + Math.random() * 0.5);
            this.snowVel[o + 2] = (Math.random() - 0.5) * 0.6;
            if (!alive) y = -1000;
          }
          const sway = Math.sin(time * 1.3 + i) * 0.25;
          x += this.snowVel[o] * dt;
          y += this.snowVel[o + 1] * dt;
          z += (this.snowVel[o + 2] + sway) * dt;
          this.snowVel[o] *= 1 - dt * 0.25;
          this.snowData.set([x, y, z], o);
        }
        this.snow.geometry.attributes.position.needsUpdate = true;
      }
      if (out) {
        if (!this.patter) {
          this.patter = new Spatial(out, 2, 1.2, 40);
          const src = loopNoise(out, 'white');
          const hp = out.ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 1800;
          src.connect(hp).connect(this.patter.input);
        }
        this.patter.setPosition({ x: e.x + inward * 0.5, y: e.sillY + 1, z: 0 });
        this.patter.setLevel(showRain ? 0.12 * k : kind === 'snow' ? 0.015 : 0);
      }
    } else this.patter?.setLevel(0);
  }

  /** Scatters flakes and drops so the first frame is not empty. */
  private seed(station: StationInfo): void {
    const e = station.exit;
    for (let i = 0; i < SNOW; i++) this.snowData.set([e.x - e.dir * Math.random() * 5, e.sillY + Math.random() * e.height, (Math.random() * 2 - 1) * e.halfWidth], i * 3);
    for (let i = 0; i < RAIN; i++) this.rainData.set([e.x - e.dir * 0.5, e.sillY - 1, 0, e.x, e.sillY - 1, 0], i * 6);
    this.drift.position.set(e.x - e.dir * 1.2, e.sillY + 0.012, 0);
    this.drift.scale.set(2.4, e.halfWidth * 2 - 0.3, 1);
  }

  /** Slow, pale mist hanging over the stairs below the doors. */
  private driftMist(dt: number, time: number, station: StationInfo): void {
    const e = station.exit;
    const inward = -e.dir;
    const d = this.mistData;
    for (let i = 0; i < MIST; i++) {
      const o = i * 3;
      const along = (d[o] - e.x) * inward;
      if (along < 0 || along > 9 || d[o + 1] === 0) {
        d[o] = e.x + inward * Math.random() * 9;
        d[o + 1] = e.sillY - 2.6 + Math.random() * 3.6;
        d[o + 2] = (Math.random() - 0.5) * 4.4;
      }
      d[o] += inward * 0.12 * dt;
      d[o + 1] += Math.sin(time * 0.3 + i) * 0.05 * dt;
      d[o + 2] += Math.cos(time * 0.23 + i * 1.7) * 0.06 * dt;
    }
    this.mist.geometry.attributes.position.needsUpdate = true;
  }

  /** Wet leaves carried in on shoes: on the landing, down the steps and a few across the hall floor. */
  private layLeaves(station: StationInfo): void {
    const e = station.exit;
    const inward = -e.dir;
    const hallY = e.sillY - 3.4;
    for (let i = 0; i < LEAVES; i++) {
      const r = (k: number) => hash01(station.index * 100 + i, k);
      // Distance in from the doors: landing (0..6), stairs (6..13), hall floor (13..19).
      const d = Math.pow(r(1), 1.4) * 19;
      let y = hallY;
      if (d < 6) y = e.sillY;
      else if (d < 13) {
        const up = 13 - d;
        y = hallY + (Math.floor(up / 0.35) + 1) * 0.17;
      }
      this.dummy.position.set(e.x + inward * d, y + 0.008, (r(2) - 0.5) * (d < 13 ? 4.4 : 3.2));
      this.dummy.rotation.set(-Math.PI / 2, 0, r(3) * Math.PI * 2);
      const s = 0.7 + r(4) * 0.7;
      this.dummy.scale.set(s, s, 1);
      this.dummy.updateMatrix();
      this.leaves.setMatrixAt(i, this.dummy.matrix);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  /** Two trails of wet prints from the foot of the stairs toward the gates. */
  private layPrints(station: StationInfo): void {
    const e = station.exit;
    const inward = -e.dir;
    const start = e.stairX;
    const end = station.gates.unpaidX;
    const y = station.gates.y + 0.005;
    for (let i = 0; i < PRINTS; i++) {
      const trail = i % 2;
      const step = Math.floor(i / 2);
      const t = step / (PRINTS / 2);
      const x = start + (end - start) * t;
      const lane = trail ? 1.3 : -0.9;
      const foot = step % 2 ? 0.11 : -0.11;
      const wobble = Math.sin(step * 1.7 + trail) * 0.15;
      this.dummy.position.set(x, y, lane + foot + wobble);
      this.dummy.rotation.set(-Math.PI / 2, 0, (inward > 0 ? -Math.PI / 2 : Math.PI / 2) + wobble * 0.3);
      // Prints fade as the shoes dry.
      const s = 1 - t * 0.35;
      this.dummy.scale.set(s, s, 1);
      this.dummy.updateMatrix();
      this.prints.setMatrixAt(i, this.dummy.matrix);
    }
    this.prints.instanceMatrix.needsUpdate = true;
  }
}

const OPEN_RAIN = 900;
const OPEN_SNOW = 1400;
/** Half the size of the box of rain or snow kept around the player in the open. */
const OPEN_BOX = { x: 22, y: 14, z: 22 };

/**
 * Rain and snow falling around the player in the open air, from the same
 * weather as the street above the stations.
 */
export class OpenAirWeather {
  private readonly rain: LineSegments;
  private readonly snow: Points;
  private readonly rainData = new Float32Array(OPEN_RAIN * 6);
  private readonly snowData = new Float32Array(OPEN_SNOW * 3);

  constructor(scene: Scene) {
    const rainGeo = new BufferGeometry();
    rainGeo.setAttribute('position', new BufferAttribute(this.rainData, 3).setUsage(DynamicDrawUsage));
    this.rain = new LineSegments(rainGeo, new LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.4, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    const snowGeo = new BufferGeometry();
    snowGeo.setAttribute('position', new BufferAttribute(this.snowData, 3).setUsage(DynamicDrawUsage));
    this.snow = new Points(snowGeo, new PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    for (let i = 0; i < OPEN_RAIN; i++) this.rainData[i * 6 + 1] = -1e4;
    for (let i = 0; i < OPEN_SNOW; i++) this.snowData[i * 3 + 1] = -1e4;
    scene.add(this.rain, this.snow);
  }

  /**
   * @param open how much of the sky the player sees, 0 to 1
   * @param floor the ground out here, where rain and snow stop (up on a street, the street)
   */
  update(dt: number, time: number, weather: WeatherState, eye: Vector3, open: number, floor = -Infinity): void {
    const bottom = Math.max(eye.y - OPEN_BOX.y, floor);
    const kind = weather.kind;
    const k = weather.intensity * Math.min(1, open * 1.5);
    this.rain.visible = k > 0.02 && (kind === 'rain' || kind === 'sleet');
    this.snow.visible = k > 0.02 && (kind === 'snow' || kind === 'sleet');
    const respawn = (o: number, data: Float32Array, top: boolean) => {
      data[o] = eye.x + (Math.random() * 2 - 1) * OPEN_BOX.x;
      data[o + 1] = eye.y + (top ? OPEN_BOX.y : (Math.random() * 2 - 1) * OPEN_BOX.y);
      data[o + 2] = eye.z + (Math.random() * 2 - 1) * OPEN_BOX.z;
    };
    if (this.rain.visible) {
      for (let i = 0; i < OPEN_RAIN; i++) {
        const o = i * 6;
        if (i / OPEN_RAIN > k) { this.rainData[o + 1] = this.rainData[o + 4] = -1e4; continue; }
        const far = Math.abs(this.rainData[o] - eye.x) > OPEN_BOX.x || Math.abs(this.rainData[o + 2] - eye.z) > OPEN_BOX.z;
        if (this.rainData[o + 1] < bottom || far) respawn(o, this.rainData, this.rainData[o + 1] > -1e3 && !far);
        this.rainData[o + 1] -= dt * 11;
        this.rainData[o + 3] = this.rainData[o] - 0.02;
        this.rainData[o + 4] = this.rainData[o + 1] + 0.35;
        this.rainData[o + 5] = this.rainData[o + 2];
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.snow.visible) {
      for (let i = 0; i < OPEN_SNOW; i++) {
        const o = i * 3;
        if (i / OPEN_SNOW > k) { this.snowData[o + 1] = -1e4; continue; }
        const far = Math.abs(this.snowData[o] - eye.x) > OPEN_BOX.x || Math.abs(this.snowData[o + 2] - eye.z) > OPEN_BOX.z;
        if (this.snowData[o + 1] < bottom || far) respawn(o, this.snowData, this.snowData[o + 1] > -1e3 && !far);
        this.snowData[o + 1] -= dt * (0.7 + (i % 5) * 0.08);
        this.snowData[o] += Math.sin(time * 0.9 + i) * dt * 0.3;
        this.snowData[o + 2] += Math.cos(time * 0.7 + i * 1.3) * dt * 0.3;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }
}
