import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, MeshBasicMaterial, Points, PointsMaterial, type Scene } from 'three';
import { hash01, stockholm } from './clock';
import { isCold } from './calendar';
import { glowTexture } from './gfx/textures';
import { CAVE_HALF_L, type Stock } from './layout';
import { stationLight } from './night';
import { Spatial, thump, type AudioOut } from './sfx';
import type { Train } from './train';
import type { StationInfo } from './world/station';

/**
 * Light that is not baked: the station's one broken fluorescent tube and blue
 * sparks off the power rail on cold nights. Trains running over the points
 * give a clunk, but the carriage lights stay steady.
 */

const SPARKS = 18;
/** Collector shoes ride the power rail next to each bogie of a stock. */
const shoes = (stock: Stock) => stock.sections.flatMap((s) => [s.center - s.halfLength + 2.5, s.center + s.halfLength - 2.5]);

export interface EffectTrain {
  train: Train;
  x: number;
  z: number;
  speed: number;
}

/** Is the broken tube lit at this moment? Bursts of flicker, then long steady spells. Shared by everyone. */
export function tubeOn(time: number, station: number): boolean {
  const burst = hash01(Math.floor(time / 4), station * 11 + 5) < 0.35;
  if (!burst) return true;
  return hash01(Math.floor(time * 14), station * 11 + 6) > 0.45;
}

export class Effects {
  private readonly sparkData = new Float32Array(SPARKS * 3);
  private readonly sparks: Points;
  private hum: { spatial: Spatial; buzz: GainNode } | null = null;
  private humStation = -1;
  private lastOn = true;
  private readonly overFrog = new Map<Train, boolean>();
  private points: number[] = [];

  constructor(scene: Scene, private readonly stations: StationInfo[]) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.sparkData, 3).setUsage(DynamicDrawUsage));
    this.sparks = new Points(geo, new PointsMaterial({ size: 2.2, map: glowTexture(), color: 0x9fc4ff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    this.sparks.name = 'power-rail-sparks';
    scene.add(this.sparks);
    const x = stations.map((s) => s.cx);
    // Crossovers just outside the end stations, before each turnback, and west of T-Centralen.
    this.points = [x[Math.min(1, x.length - 1)] + CAVE_HALF_L + 18, ...stations.filter((s, i) => i === 0 || s.exitDir < 0).map((s) => s.cx - s.exitDir * (CAVE_HALF_L + 12))];
  }

  /**
   * @param riding the train the player is aboard, for the clunk over the points
   * @param temperature outside, for the sparks
   */
  update(time: number, player: { x: number; y: number; z: number }, trains: EffectTrain[], riding: Train | null, temperature: number, out: AudioOut | null): void {
    this.tube(time, player, out);
    this.sparkle(time, player, trains, temperature, out);
    this.overPoints(trains, riding, out);
  }

  private tube(time: number, player: { x: number }, out: AudioOut | null): void {
    let near: StationInfo | null = null;
    for (const s of this.stations) if (Math.abs(s.cx - player.x) < CAVE_HALF_L + 40) near = s;
    const level = stationLight(time);
    for (const s of this.stations) {
      if (s !== near) continue;
      const on = tubeOn(time, s.index);
      (s.tube.material as MeshBasicMaterial).color.setHex(0xf2f5ee).multiplyScalar(level * (on ? 1 : 0.12));
      if (out) {
        if (!this.hum) {
          const spatial = new Spatial(out, 1.5, 1.6, 30);
          // Mains hum with a rattle of harmonics, as a starter struggles.
          const osc = out.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = 100;
          const lp = out.ctx.createBiquadFilter();
          lp.type = 'bandpass';
          lp.frequency.value = 420;
          lp.Q.value = 1.4;
          const buzz = out.ctx.createGain();
          buzz.gain.value = 0.02;
          osc.connect(lp).connect(buzz).connect(spatial.input);
          osc.start();
          this.hum = { spatial, buzz };
        }
        if (this.humStation !== s.index) {
          this.humStation = s.index;
          this.hum.spatial.setPosition(s.tube.position);
        }
        this.hum.spatial.setLevel(0.6, 0.05);
        this.hum.buzz.gain.setTargetAtTime(on ? 0.02 : 0.06, out.ctx.currentTime, 0.01);
        if (on !== this.lastOn && on) this.tick(out, 0.03);
      }
      this.lastOn = on;
    }
    if (!near) this.hum?.spatial.setLevel(0);
  }

  private tick(out: AudioOut, volume: number): void {
    thump(out, volume, 2400);
  }

  private sparkle(time: number, player: { x: number; y: number; z: number }, trains: EffectTrain[], temperature: number, out: AudioOut | null): void {
    const h = stockholm(time).hours;
    const night = h >= 17 || h < 7;
    const on = isCold(temperature) && temperature < 0 && night;
    this.sparks.visible = on;
    if (!on) return;
    let n = 0;
    for (const t of trains) {
      if (t.speed < 3 || Math.abs(t.x - player.x) > 400) continue;
      const railZ = t.z + Math.sign(t.z || 1) * 1.6;
      for (const shoe of shoes(t.train.stock)) {
        if (n >= SPARKS) break;
        // Brief blue flashes where the shoe skips over ice on the rail.
        if (Math.random() > 0.06) continue;
        this.sparkData.set([t.x + shoe, 0.32, railZ], n * 3);
        n++;
        if (out && Math.hypot(t.x + shoe - player.x, railZ - player.z) < 25) thump(out, 0.04, 3200);
      }
    }
    for (let i = n; i < SPARKS; i++) this.sparkData.set([0, -1000, 0], i * 3);
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }

  private overPoints(trains: EffectTrain[], riding: Train | null, out: AudioOut | null): void {
    for (const t of trains) {
      // Each unit clunks as its bogies cross the frog.
      const window = Math.max(0.6, t.speed * 0.25);
      const over = t.speed > 0.5 && this.points.some((p) => t.train.stock.units.some((c) => Math.abs(t.x + c - p) < window));
      if (this.overFrog.get(t.train) === over) continue;
      this.overFrog.set(t.train, over);
      if (over && out && riding === t.train) thump(out, 0.35, 140);
    }
  }
}
