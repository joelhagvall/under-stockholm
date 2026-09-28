/** Independent pointer ownership lets walking and looking happen at the same time. */
export class TouchGestures {
  private movement: { id: number; x: number; y: number; radius: number } | null = null;
  private viewing: { id: number; x: number; y: number } | null = null;
  forward = 0;
  side = 0;

  startMove(id: number, x: number, y: number, radius: number): boolean {
    if (this.movement || this.viewing?.id === id) return false;
    this.movement = { id, x, y, radius };
    return true;
  }

  startLook(id: number, x: number, y: number): boolean {
    if (this.viewing || this.movement?.id === id) return false;
    this.viewing = { id, x, y };
    return true;
  }

  move(id: number, x: number, y: number): { dx: number; dy: number } | null {
    if (this.movement?.id === id) {
      const dx = (x - this.movement.x) / this.movement.radius;
      const dy = (y - this.movement.y) / this.movement.radius;
      const length = Math.hypot(dx, dy);
      const amount = Math.min(1, Math.max(0, (length - 0.12) / 0.88));
      this.side = length ? dx / length * amount : 0;
      this.forward = length ? -dy / length * amount : 0;
    }
    if (this.viewing?.id !== id) return null;
    const delta = { dx: x - this.viewing.x, dy: y - this.viewing.y };
    this.viewing.x = x;
    this.viewing.y = y;
    return delta;
  }

  end(id: number): void {
    if (this.movement?.id === id) { this.movement = null; this.forward = this.side = 0; }
    if (this.viewing?.id === id) this.viewing = null;
  }

  reset(): void {
    this.movement = this.viewing = null;
    this.forward = this.side = 0;
  }
}
