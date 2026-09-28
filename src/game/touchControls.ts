import { label, lang, text } from './i18n/text';
import { TouchGestures } from './touchGestures';
import './touch.css';

interface TouchActions {
  move(forward: number, side: number): void;
  look(dx: number, dy: number): void;
  run(enabled: boolean): void;
  jump(): void;
  sit(): void;
  climb(): void;
  use(): void;
  throttle(delta: number): void;
  doors(): void;
  pause(): void;
  map(): void;
  activateAudio(): void;
}

export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLElement;
  private readonly run: HTMLButtonElement;
  private readonly seat: HTMLButtonElement;
  private readonly climb: HTMLButtonElement;
  private readonly use: HTMLButtonElement;
  private readonly walkButtons: HTMLElement;
  private readonly driveButtons: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly gestures = new TouchGestures();
  private readonly captured = new Map<number, HTMLElement>();
  private enabled = false;
  private running = false;

  constructor(parent: HTMLElement, canvas: HTMLCanvasElement, private readonly actions: TouchActions) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.innerHTML = `
      <div class="touch-toolbar">
        <button type="button" data-action="map" aria-pressed="false" data-t="touch.map"></button>
        <button type="button" data-action="pause" data-t="touch.pause"></button>
      </div>
      <div class="touch-stick" role="group" data-t-label="touch.move"><span class="touch-knob"></span><span class="touch-stick-label" data-t="touch.move"></span></div>
      <div class="touch-actions touch-drive" hidden>
        <button type="button" data-action="power" data-t-label="driver.power">${text.driver.plus}</button>
        <button type="button" data-action="brake" data-t-label="driver.brake">${text.driver.minus}</button>
        <button type="button" data-action="doors" data-t="driver.doors"></button>
      </div>
      <div class="touch-actions touch-walk">
        <button type="button" data-action="use" data-t="touch.use" hidden></button>
        <button type="button" data-action="climb" data-t="touch.climb" hidden></button>
        <button type="button" data-action="sit" data-t="touch.sit" hidden></button>
        <button type="button" data-action="run" aria-pressed="false" data-t="touch.run"></button>
        <button type="button" data-action="jump" data-t="touch.jump"></button>
      </div>`;
    this.relabel();
    parent.appendChild(this.root);
    this.knob = this.root.querySelector('.touch-knob')!;
    const button = (action: string) => this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
    this.run = button('run');
    this.seat = button('sit');
    this.climb = button('climb');
    this.use = button('use');
    this.walkButtons = this.root.querySelector('.touch-walk')!;
    this.driveButtons = this.root.querySelector('.touch-drive')!;
    this.stick = this.root.querySelector('.touch-stick')!;
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!target || !this.enabled) return;
      actions.activateAudio();
      switch (target.dataset.action) {
        case 'run': this.setRunning(!this.running); break;
        case 'jump': actions.jump(); break;
        case 'sit': actions.sit(); break;
        case 'climb': actions.climb(); break;
        case 'use': actions.use(); break;
        case 'power': actions.throttle(1); break;
        case 'brake': actions.throttle(-1); break;
        case 'doors': actions.doors(); break;
        case 'pause': actions.pause(); break;
        case 'map': actions.map(); target.setAttribute('aria-pressed', String(target.getAttribute('aria-pressed') !== 'true')); break;
      }
    });
    const stick = this.root.querySelector<HTMLElement>('.touch-stick')!;
    const capture = (element: HTMLElement, event: PointerEvent, started: boolean) => {
      if (!started) return;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      this.captured.set(event.pointerId, element);
      actions.activateAudio();
    };
    stick.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      const rect = stick.getBoundingClientRect();
      capture(stick, event, this.gestures.startMove(event.pointerId, rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width * 0.32));
      this.gestures.move(event.pointerId, event.clientX, event.clientY);
      this.syncMovement();
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      capture(canvas, event, this.gestures.startLook(event.pointerId, event.clientX, event.clientY));
    });
    for (const element of [stick, canvas]) {
      element.addEventListener('pointermove', (event) => {
        if (!this.enabled || !this.captured.has(event.pointerId)) return;
        event.preventDefault();
        const delta = this.gestures.move(event.pointerId, event.clientX, event.clientY);
        if (delta) actions.look(delta.dx * 1.7, delta.dy * 1.7);
        this.syncMovement();
      });
      const release = (event: PointerEvent) => {
        this.captured.delete(event.pointerId);
        this.gestures.end(event.pointerId);
        this.syncMovement();
      };
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('lostpointercapture', release);
    }
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('resize', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  private syncMovement(): void {
    this.actions.move(this.gestures.forward, this.gestures.side);
    this.knob.style.transform = `translate(${this.gestures.side * 32}px, ${-this.gestures.forward * 32}px)`;
  }

  private setRunning(value: boolean): void {
    this.running = value;
    this.run.setAttribute('aria-pressed', String(value));
    this.actions.run(value);
  }

  reset(): void {
    this.gestures.reset();
    for (const [id, element] of this.captured) if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    this.captured.clear();
    this.syncMovement();
    this.setRunning(false);
  }

  /** Writes the buttons' labels in the current language. The seat button follows on the next `setContext`. */
  relabel(): void {
    this.root.lang = lang();
    label(this.root);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.hidden = !enabled;
    if (!enabled) this.reset();
  }

  setContext(seated: boolean, canSit: boolean, canClimb: boolean, canUse = false): void {
    this.seat.hidden = !seated && !canSit;
    const label = seated ? text.touch.stand : text.touch.sit;
    if (this.seat.textContent !== label) this.seat.textContent = label;
    this.climb.hidden = !canClimb;
    this.use.hidden = !canUse || canClimb;
  }

  /** Driving swaps walking controls for the master controller and doors. */
  setDriving(driving: boolean): void {
    this.walkButtons.hidden = driving;
    this.stick.hidden = driving;
    this.driveButtons.hidden = !driving;
  }
}
