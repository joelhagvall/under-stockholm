import { BackSide, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, SphereGeometry, type Vector3 } from 'three';
import { sunElevation } from '../clock';
import type { WeatherState } from '../weather';

/**
 * The sky over the open-air stretches: a dome that follows the camera, blue
 * by day, orange at dusk and dark with the city's glow at night, grey when it
 * rains, from the sun's real position over Stockholm. Underground the rock
 * hides it. `horizon` is what the fog fades into outdoors, and `daylight` how
 * bright the open air is (see `setDaylight`).
 */

export const SKY_RADIUS = 340;

const ZENITH = { day: new Color(0x4a86d0), overcast: new Color(0x8e98a2), dusk: new Color(0x33507f), night: new Color(0x0b1020) };
const HORIZON = { day: new Color(0xc2dcf0), overcast: new Color(0xc4c8cc), dusk: new Color(0xf2a462), night: new Color(0x2a2a34) };

export class Sky {
  readonly mesh: Mesh;
  readonly horizon = new Color();
  readonly zenith = new Color();
  daylight = 1;
  private readonly colors: Float32BufferAttribute;
  private readonly heights: number[] = [];
  private key = '';

  constructor() {
    const geo = new SphereGeometry(SKY_RADIUS, 24, 12);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) this.heights.push(pos.getY(i) / SKY_RADIUS);
    this.colors = new Float32BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', this.colors);
    this.mesh = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
    this.mesh.name = 'sky';
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  /** Recolours the sky for a moment and weather (at most once a minute of game time), and keeps it around the camera. */
  update(camera: Vector3, time: number, weather: WeatherState): void {
    this.mesh.position.copy(camera);
    const key = `${Math.floor(time / 60)}:${weather.kind}`;
    if (key === this.key) return;
    this.key = key;
    const elevation = sunElevation(time);
    const day = Math.min(1, Math.max(0, (elevation + 4) / 12));
    const dusk = Math.max(0, 1 - Math.abs(elevation - 1) / 6);
    const grey = weather.kind === 'clear' ? 0 : weather.kind === 'cloudy' ? 0.7 : 1;
    this.zenith.copy(ZENITH.night).lerp(ZENITH.day.clone().lerp(ZENITH.overcast, grey), day).lerp(ZENITH.dusk, dusk * 0.5 * (1 - grey));
    this.horizon.copy(HORIZON.night).lerp(HORIZON.day.clone().lerp(HORIZON.overcast, grey), day).lerp(HORIZON.dusk, dusk * 0.7 * (1 - grey * 0.7));
    this.daylight = (0.24 + 0.76 * day) * (1 - grey * 0.18);
    const c = new Color();
    for (let i = 0; i < this.heights.length; i++) {
      const h = Math.max(0, this.heights[i]);
      c.copy(this.horizon).lerp(this.zenith, Math.pow(h, 0.6));
      this.colors.setXYZ(i, c.r, c.g, c.b);
    }
    this.colors.needsUpdate = true;
  }
}
