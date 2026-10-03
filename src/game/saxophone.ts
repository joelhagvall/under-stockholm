import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, TorusGeometry, Vector3, type Scene } from 'three';
import { BEAT, hallReverb, improvise, reed, saxPlaying } from './saxSolo';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { text } from './i18n/text';
import { Spatial, thump, type AudioOut } from './sfx';
import type { StationInfo } from './world/station';
import type { Interactable } from './world/zones';

/**
 * A saxophonist in Kungsträdgården's ticket hall, on the paid side by the
 * escalators. The playing is generated: a slow swing over a ii-V-I, a
 * breathy reed through a moving filter, with the hall's echo.
 */

const AUDIBLE = 60;

export class Saxophonist {
  readonly interactable: Interactable;
  private readonly group = new Group();
  private readonly figure = figureMesh(1);
  private readonly horn = new Group();
  private readonly position: Vector3;
  private readonly yaw: number;
  private voice: { spatial: Spatial; bus: GainNode } | null = null;
  private solo: ReturnType<typeof improvise> | null = null;
  private soloStart = 0;
  private cursor = 0;
  private seed = Math.floor(Date.now() / 86400000) * 7;
  private tonic = 58;
  private clock = 0;
  private now = 0;
  private out: AudioOut | null = null;

  constructor(scene: Scene, station: StationInfo) {
    this.position = new Vector3(station.hallX(5), station.hall.y, 6.6);
    this.yaw = Math.PI;
    paintFigure(this.figure, 0, { coat: 0x1b1d22, torso: 0x6b2430, skin: 0x634432, hair: 0x2b2b2b, bag: 0x1b1d22, trousers: 0x1b1d22, shoes: 0x0f0f10 });
    this.group.add(this.figure);
    // A tenor saxophone: a brass body, a curved neck and an upturned bell.
    const brass = new MeshLambertMaterial({ color: 0xc9a13a });
    const body = new Mesh(new CylinderGeometry(0.045, 0.03, 0.55, 10), brass);
    body.position.y = -0.12;
    const bow = new Mesh(new TorusGeometry(0.07, 0.035, 8, 12, Math.PI), brass);
    bow.position.set(0.07, -0.4, 0);
    bow.rotation.z = Math.PI;
    const bell = new Mesh(new ConeGeometry(0.1, 0.22, 14, 1, true), brass);
    bell.position.set(0.15, -0.26, 0);
    bell.rotation.z = Math.PI;
    const neck = new Mesh(new CylinderGeometry(0.015, 0.02, 0.2, 8), brass);
    neck.position.set(-0.03, 0.2, 0);
    neck.rotation.z = 0.6;
    this.horn.add(body, bow, bell, neck);
    this.group.add(this.horn);
    // The open case, with a few coins.
    const caseMesh = new Mesh(new BoxGeometry(0.8, 0.07, 0.32), new MeshLambertMaterial({ color: 0x2b2124 }));
    caseMesh.position.set(this.position.x, this.position.y + 0.035, this.position.z - 0.9);
    const lining = new Mesh(new BoxGeometry(0.72, 0.02, 0.26), new MeshLambertMaterial({ color: 0x2c4a7a }));
    lining.position.copy(caseMesh.position).setY(this.position.y + 0.075);
    this.group.add(caseMesh, lining);
    scene.add(this.group);
    this.interactable = {
      pos: caseMesh.position.clone(), radius: 1.6, prompt: () => text.sax.prompt,
      enabled: () => Saxophonist.playing(this.now),
      act: () => {
        this.seed++;
        this.tonic = [58, 60, 53, 55, 63][this.seed % 5];
        this.solo = null;
        if (this.out) thump(this.out, 0.08, 2400);
        return text.sax.thanks;
      },
    };
  }

  static playing(epoch: number): boolean {
    return saxPlaying(epoch);
  }

  update(dt: number, time: number, listener: Vector3, out: AudioOut | null): void {
    this.clock += dt;
    this.now = time;
    this.out = out;
    const here = Saxophonist.playing(time);
    const distance = listener.distanceTo(this.position);
    this.group.visible = here && distance < 160;
    if (!this.group.visible) { this.voice?.spatial.setLevel(0, 0.3); return; }
    const sway = Math.sin(this.clock * Math.PI / BEAT / 2) * 0.1;
    drawFigure(this.figure, 0, { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.yaw + sway, walking: false, arm: 'phone', sway: 0.05 + Math.sin(this.clock * 0.7) * 0.03 }, this.clock);
    this.figure.instanceMatrix.needsUpdate = true;
    const forward = new Vector3(Math.sin(this.yaw + sway), 0, Math.cos(this.yaw + sway));
    this.horn.position.copy(this.position).addScaledVector(forward, 0.28).setY(this.position.y + 1.12);
    this.horn.rotation.y = this.yaw + sway + Math.PI / 2;
    if (!out || distance > AUDIBLE) { this.voice?.spatial.setLevel(0, 0.4); return; }
    this.ensureVoice(out);
    this.voice!.spatial.setPosition({ x: this.position.x, y: this.position.y + 1.2, z: this.position.z });
    this.voice!.spatial.setLevel(0.9, 0.5);
    this.schedule(out);
  }

  private ensureVoice(out: AudioOut): void {
    if (this.voice) return;
    const ctx = out.ctx;
    const spatial = new Spatial(out, 3, 1.1, 90);
    const bus = ctx.createGain();
    bus.gain.value = 0.8;
    const reverb = hallReverb(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    bus.connect(spatial.input);
    bus.connect(reverb).connect(wet).connect(spatial.input);
    this.voice = { spatial, bus };
  }

  private schedule(out: AudioOut): void {
    const ctx = out.ctx;
    const now = ctx.currentTime;
    if (!this.solo || now > this.soloStart + this.solo.length + BEAT * 2) {
      this.solo = improvise(this.seed++, this.tonic);
      this.soloStart = now + 0.2;
      this.cursor = 0;
    }
    while (this.cursor < this.solo.notes.length && this.soloStart + this.solo.notes[this.cursor].start < now + 0.4) {
      const n = this.solo.notes[this.cursor++];
      const at = this.soloStart + n.start;
      if (at >= now - 0.05) reed(ctx, this.voice!.bus, at, n);
    }
  }
}
