import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, Points, PointsMaterial, type Scene } from 'three';
import { noise3 } from './gfx/noise';
import { dayNumber } from './calendar';
import { stockholm } from './clock';
import { glowTexture, newspaperTexture, setNewspaperHeadline } from './gfx/textures';
import { headlinesFor, pickHeadline } from './news';
import { headline1975 } from './news1975';
import { CAVE_HALF_L, PLATFORM_HALF_W, PLATFORM_Y, TRAIN_HALF_L } from './layout';
import { loopNoise, type AudioOut } from './sfx';
import { NOSE } from './trainModel';

/**
 * The piston effect: a train pushes a column of air ahead of it through the
 * tube. On the platform you hear and feel it before you see the train, and
 * loose newspaper pages lift and skid along the stone.
 */

export interface WindTrain {
  x: number;
  speed: number;
  /** +1 heading toward +x, -1 toward -x. */
  dir: 1 | -1;
}

/** Wind strength 0..1 and its direction at the station centered at `cx`. */
export function tunnelWind(cx: number, trains: WindTrain[]): { strength: number; dir: 1 | -1 } {
  let strength = 0;
  let dir: 1 | -1 = 1;
  for (const t of trains) {
    if (t.speed < 0.5) continue;
    const front = t.x + t.dir * (TRAIN_HALF_L + NOSE);
    const mouth = cx - t.dir * CAVE_HALF_L;
    // Positive while the nose is still in the tube, heading for this cave.
    const out = (mouth - front) * t.dir;
    const pace = Math.min(1, t.speed / 15);
    let w = 0;
    if (out > 0 && out < 380) w = (1 - out / 380) ** 2;
    else if (out <= 0 && out > -70) w = 1 + out / 70;
    w *= pace;
    if (w > strength) { strength = w; dir = t.dir; }
  }
  return { strength, dir };
}

const SHEETS = 6;
/** Dust motes stirred up into the lamp light. */
const DUST = 220;

interface Sheet {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; tumble: number; spin: number;
}

export class Wind {
  private readonly mesh: InstancedMesh;
  private readonly sheets = new Map<number, Sheet[]>();
  private readonly dummy = new Object3D();
  private station = -1;
  private clock = 0;
  private sound: { gain: GainNode; band: BiquadFilterNode; whistle: GainNode } | null = null;
  private readonly dust: Points;
  private readonly dustData = new Float32Array(DUST * 3);
  private dustStation = -1;
  private paperDay = '';
  strength = 0;

  constructor(scene: Scene) {
    const dustGeo = new BufferGeometry();
    dustGeo.setAttribute('position', new BufferAttribute(this.dustData, 3).setUsage(DynamicDrawUsage));
    this.dust = new Points(dustGeo, new PointsMaterial({ size: 0.05, map: glowTexture(), color: 0xfff1d6, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.dust.visible = false;
    this.dust.name = 'dust';
    scene.add(this.dust);

    const material = new MeshBasicMaterial({ map: newspaperTexture(), side: DoubleSide, color: 0xb9b6ae });
    this.mesh = new InstancedMesh(new PlaneGeometry(0.44, 0.32), material, SHEETS);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'newspapers';
    scene.add(this.mesh);
  }

  /**
   * Once a second: today's real headline on the loose pages, a different one from the paper left on the seat.
   * @param past the time machine's 1975: that day's news from then
   */
  setDay(epoch: number, past = false): void {
    const day = dayNumber(epoch);
    const key = `${day}-${past}`;
    if (key === this.paperDay) return;
    this.paperDay = key;
    if (past) {
      const c = stockholm(epoch);
      setNewspaperHeadline(headline1975(c.month, c.day, 1));
      return;
    }
    void headlinesFor(day).then((news) => {
      // A failed fetch goes back to the made-up headline, so the pages never show yesterday's news.
      if (this.paperDay === key) setNewspaperHeadline(news ? pickHeadline(news, day, 1) : null);
    });
  }

  private pages(station: number, cx: number): Sheet[] {
    let list = this.sheets.get(station);
    if (!list) {
      list = Array.from({ length: SHEETS }, (_, i) => {
        const h = noise3(station * 3.1, i * 1.7, 0.5, 91);
        return {
          x: cx - 55 + i * 21 + h * 8, y: PLATFORM_Y + 0.004, z: (i % 2 ? -1 : 1) * (1.2 + h * 2.4),
          vx: 0, vy: 0, vz: 0, yaw: h * 6.28, tumble: 0, spin: 0,
        };
      });
      this.sheets.set(station, list);
    }
    return list;
  }

  /** Dust rises from the trackbed and the platform edge and swirls in the lamp light as the air moves. */
  private stir(dt: number, station: { index: number; cx: number }, dir: 1 | -1, w: number, lightLevel: number): void {
    const d = this.dustData;
    if (station.index !== this.dustStation) {
      this.dustStation = station.index;
      for (let i = 0; i < DUST; i++) d.set([station.cx + (Math.random() - 0.5) * 140, 1.3 + Math.random() * 3.2, (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 4.2)], i * 3);
    }
    (this.dust.material as PointsMaterial).opacity = Math.min(0.85, w * 1.2) * lightLevel;
    if (w <= 0.05) return;
    for (let i = 0; i < DUST; i++) {
      const o = i * 3;
      const swirl = noise3(d[o] * 0.3, d[o + 1] * 0.5, this.clock * 0.6 + i, 31) - 0.5;
      d[o] += (dir * w * (2.5 + (i % 5) * 0.6) + swirl * 1.5) * dt;
      d[o + 1] += (swirl * 1.2 + (w - 0.4) * 0.6) * dt;
      d[o + 2] += (noise3(i, this.clock * 0.8, 3, 32) - 0.5) * 1.2 * dt;
      // Motes that drift out of the lit band are replaced near the lamps.
      if (Math.abs(d[o] - station.cx) > 72 || d[o + 1] < 1.2 || d[o + 1] > 4.5) {
        d[o] = station.cx - dir * (40 + Math.random() * 32) + (Math.random() - 0.5) * 60;
        d[o + 1] = 1.3 + Math.random() * 0.8;
        d[o + 2] = (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 4.2);
      }
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * @param station the station the listener is in (platform or track), or null
   * @param lightLevel the station light level, so pages dim with the lamps
   */
  update(dt: number, station: { index: number; cx: number } | null, trains: WindTrain[], out: AudioOut | null, lightLevel: number): void {
    this.clock += dt;
    const wind = station ? tunnelWind(station.cx, trains) : { strength: 0, dir: 1 as const };
    this.strength += (wind.strength - this.strength) * Math.min(1, dt * 2.5);
    const w = this.strength;

    if (out) {
      if (!this.sound) {
        const src = loopNoise(out, 'pink');
        const band = out.ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = 0.7;
        const gain = out.ctx.createGain();
        gain.gain.value = 0;
        src.connect(band).connect(gain).connect(out.bus);
        const whistleBand = out.ctx.createBiquadFilter();
        whistleBand.type = 'bandpass';
        whistleBand.frequency.value = 1350;
        whistleBand.Q.value = 9;
        const whistle = out.ctx.createGain();
        whistle.gain.value = 0;
        src.connect(whistleBand).connect(whistle).connect(out.bus);
        this.sound = { gain, band, whistle };
      }
      const t = out.ctx.currentTime;
      const gust = 0.85 + 0.15 * noise3(this.clock * 1.3, 0, 0, 12);
      this.sound.gain.gain.setTargetAtTime(w * w * 0.55 * gust, t, 0.2);
      this.sound.band.frequency.setTargetAtTime(260 + w * 900, t, 0.3);
      this.sound.whistle.gain.setTargetAtTime(Math.max(0, w - 0.55) * 0.08 * gust, t, 0.3);
    }

    this.mesh.visible = station !== null;
    this.dust.visible = station !== null && w > 0.05;
    if (station) this.stir(dt, station, wind.dir, w, lightLevel);
    if (!station) return;
    if (station.index !== this.station) this.station = station.index;
    const list = this.pages(station.index, station.cx);
    (this.mesh.material as MeshBasicMaterial).color.setScalar(0.72 * lightLevel);
    list.forEach((p, i) => {
      const onPlatform = Math.abs(p.z) < PLATFORM_HALF_W;
      const floor = onPlatform ? PLATFORM_Y + 0.004 : 0.02;
      const grounded = p.y <= floor + 0.01;
      const lift = w > 0.3 + (i % 3) * 0.08;
      const turb = noise3(p.x * 0.4, this.clock * 1.7, i * 3.3, 7) - 0.5;
      if (lift) {
        const target = wind.dir * w * (5 + i * 0.6);
        p.vx += (target - p.vx) * Math.min(1, dt * 1.8);
        p.vz += turb * 6 * w * dt;
        p.vy += ((w - 0.3) * 5.5 + turb * 4 - 2.2) * dt;
        p.spin += (w * 9 * (i % 2 ? 1 : -1) - p.spin) * dt;
      } else {
        // Pages flutter down and skid to rest.
        p.vy = Math.max(p.vy - 3.2 * dt, -0.7 - turb * 0.4);
        const drag = grounded ? 4 : 0.6;
        p.vx -= p.vx * Math.min(1, drag * dt);
        p.vz -= p.vz * Math.min(1, drag * dt);
        p.spin -= p.spin * Math.min(1, dt * (grounded ? 6 : 0.8));
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y = Math.min(3.2, Math.max(floor, p.y + p.vy * dt));
      if (p.y <= floor) { p.vy = Math.max(0, p.vy); if (!lift) p.tumble *= 1 - Math.min(1, dt * 5); }
      p.x = Math.max(station.cx - CAVE_HALF_L + 2, Math.min(station.cx + CAVE_HALF_L - 2, p.x));
      p.z = Math.max(-9, Math.min(9, p.z));
      p.tumble += p.spin * dt;
      p.yaw += p.spin * dt * 0.3;
      const flat = p.y <= floor + 0.01 && Math.abs(p.spin) < 0.5;
      this.dummy.position.set(p.x, p.y + 0.003, p.z);
      this.dummy.rotation.set(-Math.PI / 2 + (flat ? 0 : Math.sin(p.tumble) * 1.2), p.yaw, 0, 'YXZ');
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
