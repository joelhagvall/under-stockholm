import type { Scene, Vector3 } from 'three';
import { passengerLook } from './crowd';
import { drawFigure, figureMesh, hideFigure, paintFigure } from './figures';
import { TRAVELATOR_LAYOUT as V } from './layout';
import { BELTS } from './world/travelator';
import type { Passage } from './world/station';

/**
 * People riding the moving walkways: most stand on the right and let the
 * belt do the work, a few walk on as well. Where they are is a function of
 * the clock, so the belts are never empty while the metro runs.
 */

const PER_BELT = 6;

export class BeltRiders {
  private readonly mesh = figureMesh(PER_BELT * BELTS.length);
  private clock = 0;

  constructor(scene: Scene, private readonly passage: Passage) {
    this.mesh.name = 'belt-riders';
    this.mesh.visible = false;
    for (let i = 0; i < PER_BELT * BELTS.length; i++) paintFigure(this.mesh, i, passengerLook(i, 91));
    scene.add(this.mesh);
  }

  /** @param past the time machine's 1975: nobody is on a phone */
  update(dt: number, time: number, feet: Vector3, people: boolean, running: boolean, busy: number, past = false): void {
    this.clock += dt;
    const b = this.passage.bounds;
    const near = feet.x > b.x0 - 20 && feet.x < b.x1 + 20 && Math.abs(feet.y - b.y) < 4 && feet.z > b.z0 - 20;
    this.mesh.visible = people && near && busy > 0.05;
    if (!this.mesh.visible) return;
    const length = V.z1 - V.z0;
    const shown = Math.max(1, Math.round(PER_BELT * Math.min(1, busy + 0.3)));
    BELTS.forEach((belt, k) => {
      for (let j = 0; j < PER_BELT; j++) {
        const i = k * PER_BELT + j;
        if (j >= shown) { hideFigure(this.mesh, i); continue; }
        const walker = j % 3 === 2;
        const speed = running ? V.speed + (walker ? 0.8 : 0) : walker ? 0.8 : 0;
        const along = (((time * speed + j * (length / PER_BELT) + k * 7) % length) + length) % length;
        const z = belt.dir > 0 ? b.z0 + V.z0 + along : b.z0 + V.z1 - along;
        // Standers keep right; walkers pass on the left.
        const a = (belt.a0 + belt.a1) / 2 + (walker ? 0.25 : -0.25) * belt.dir;
        drawFigure(this.mesh, i, { x: this.passage.X(a), y: b.y + 0.04, z, yaw: belt.dir > 0 ? 0 : Math.PI, walking: walker || !running, ...(!walker && !past && j % 2 === 0 ? { arm: 'phone', carry: 'phone' } : {}) }, this.clock + i);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
