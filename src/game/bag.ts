import { Color, DirectionalLight, Group, HemisphereLight, Mesh, PerspectiveCamera, Scene, WebGLRenderTarget, type BufferGeometry, type Material, type WebGLRenderer } from 'three';
import { text } from './i18n/text';

/**
 * The bag at the top right: what the player has picked up and not yet handed
 * in, one slot per thing, each a small picture of the thing itself rendered
 * from its model. A find flies in from the middle of the view and drops into
 * its slot; at the booth everything flies out again with the finder's reward.
 * The discovery book shows the whole collection, the kinds not found yet as
 * silhouettes; choosing one says a line about it, or where such things turn up.
 */

const ICON = 128;

/** Pictures of things, rendered once with the game's own renderer and material: `key` to a data URL. */
export function renderIcons(renderer: WebGLRenderer, material: Material, things: Array<[string, BufferGeometry]>): Map<string, string> {
  const icons = new Map<string, string>();
  const target = new WebGLRenderTarget(ICON, ICON);
  const scene = new Scene();
  scene.add(new HemisphereLight(0xf4f1ea, 0x5a5048, 2.6));
  const sun = new DirectionalLight(0xffffff, 1.4);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);
  const camera = new PerspectiveCamera(30, 1, 0.01, 10);
  const pixels = new Uint8Array(ICON * ICON * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON;
  const ctx = canvas.getContext('2d');
  // A render target is written in linear light; the page wants sRGB.
  const toSrgb = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    toSrgb[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
  }
  const clear = renderer.getClearColor(new Color());
  const alpha = renderer.getClearAlpha();
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    for (const [key, geometry] of things) {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const { center, radius } = geometry.boundingSphere!;
      // Turned a little and seen from above, as it lay on the floor.
      const holder = new Group();
      const mesh = new Mesh(geometry, material);
      mesh.position.copy(center).negate();
      holder.add(mesh);
      holder.rotation.y = -0.55;
      scene.add(holder);
      const distance = (radius / Math.sin((camera.fov / 2) * Math.PI / 180)) * 1.02;
      camera.position.set(0, Math.sin(0.85) * distance, Math.cos(0.85) * distance);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      scene.remove(holder);
      renderer.readRenderTargetPixels(target, 0, 0, ICON, ICON, pixels);
      if (!ctx) continue;
      const image = ctx.createImageData(ICON, ICON);
      for (let y = 0; y < ICON; y++) {
        for (let x = 0; x < ICON; x++) {
          const from = ((ICON - 1 - y) * ICON + x) * 4;
          const to = (y * ICON + x) * 4;
          image.data[to] = toSrgb[pixels[from]];
          image.data[to + 1] = toSrgb[pixels[from + 1]];
          image.data[to + 2] = toSrgb[pixels[from + 2]];
          image.data[to + 3] = pixels[from + 3];
        }
      }
      ctx.putImageData(image, 0, 0);
      icons.set(key, canvas.toDataURL('image/png'));
    }
  } finally {
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clear, alpha);
    target.dispose();
  }
  return icons;
}

/** A leather satchel with the flap closed. */
const BAG_SVG = `<svg class="hud-bag-icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M10 11 C10 4.5 22 4.5 22 11" fill="none" stroke="#5a3a22" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="4" y="10" width="24" height="18" rx="3.5" fill="#9a6538"/>
  <path d="M4 13.5 C4 11.5 5.5 10 7.5 10 H24.5 C26.5 10 28 11.5 28 13.5 V18 C22 21 10 21 4 18 Z" fill="#7a4c2a"/>
  <rect x="14" y="17" width="4" height="4.5" rx="1" fill="#ffb444"/>
</svg>`;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Bag {
  private readonly root: HTMLDivElement;
  private readonly slots: HTMLLIElement[] = [];
  private readonly status: HTMLParagraphElement;
  private readonly collectionView: HTMLElement;
  private carried: string[] = [];
  private hideTimer = 0;
  /** The collection as last shown, and the kind chosen in it. */
  private shown: { found: string[]; kinds: string[] } = { found: [], kinds: [] };
  private chosen: string | null = null;

  /**
   * @param hud the HUD, where the bag sits and finds fly
   * @param book the discovery book's panel, where the collection is shown
   * @param icons each kind's picture (`renderIcons`)
   * @param name each kind's name in the world, in Swedish
   */
  constructor(private readonly hud: HTMLElement, book: HTMLElement, private readonly icons: Map<string, string>, private readonly capacity: number, private readonly name: (kind: string) => string) {
    this.root = document.createElement('div');
    this.root.className = 'hud-bag';
    this.root.hidden = true;
    this.root.innerHTML = `${BAG_SVG}<ol class="hud-bag-slots"></ol><p class="visually-hidden" aria-live="polite"></p>`;
    const list = this.root.querySelector('ol')!;
    for (let i = 0; i < capacity; i++) {
      const slot = document.createElement('li');
      list.append(slot);
      this.slots.push(slot);
    }
    this.status = this.root.querySelector('p')!;
    hud.append(this.root);
    this.collectionView = document.createElement('section');
    this.collectionView.className = 'pause-lost';
    book.querySelector('.pause-book-groups')?.before(this.collectionView);
  }

  /** What is in the bag, drawn at once (at the start). */
  set(kinds: string[]): void {
    this.carried = [...kinds];
    this.slots.forEach((slot, i) => this.fill(slot, this.carried[i]));
    this.update();
  }

  /** A find flies in from the middle of the view and drops into the next slot. */
  put(kind: string, fresh: boolean): void {
    const index = this.carried.length;
    if (index >= this.capacity) return;
    this.carried.push(kind);
    const slot = this.slots[index];
    this.update();
    const land = () => {
      this.fill(slot, kind);
      slot.classList.add('is-landed');
      this.root.classList.remove('is-bump');
      void this.root.offsetWidth;
      this.root.classList.add('is-bump');
      if (fresh) {
        const badge = document.createElement('span');
        badge.className = 'hud-bag-new';
        badge.textContent = text.lost.newKind;
        slot.append(badge);
        window.setTimeout(() => badge.remove(), 3200);
      }
      window.setTimeout(() => slot.classList.remove('is-landed'), 600);
    };
    const icon = this.icons.get(kind);
    if (!icon || reduced()) { land(); return; }
    const chip = document.createElement('img');
    chip.className = 'hud-bag-chip';
    chip.src = icon;
    chip.alt = '';
    this.hud.append(chip);
    const hud = this.hud.getBoundingClientRect();
    const to = slot.getBoundingClientRect();
    const size = 112;
    const from = { x: hud.width / 2 - size / 2, y: hud.height / 2 - size / 2 };
    const end = { x: to.left - hud.left + to.width / 2 - size / 2, y: to.top - hud.top + to.height / 2 - size / 2 };
    const scale = to.width / size;
    const flight = chip.animate([
      { transform: `translate(${from.x}px, ${from.y + 30}px) scale(0.6)`, opacity: 0 },
      { transform: `translate(${from.x}px, ${from.y}px) scale(1.05)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${(from.x + end.x) / 2}px, ${Math.min(from.y, end.y) - 40}px) scale(0.7)`, opacity: 1, offset: 0.65 },
      { transform: `translate(${end.x}px, ${end.y}px) scale(${scale})`, opacity: 1 },
    ], { duration: 700, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });
    flight.onfinish = () => { chip.remove(); land(); };
  }

  /** Everything is handed in: the things fly out one by one and the reward floats up. */
  empty(reward: number): void {
    const handed = this.slots.filter((_, i) => this.carried[i]);
    this.carried = [];
    this.update(false);
    const motion = !reduced();
    handed.forEach((slot, i) => {
      const img = slot.querySelector('img');
      if (!img || !motion) { this.fill(slot, undefined); return; }
      img.animate([
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(-10px) scale(1.25)', opacity: 1, offset: 0.35 },
        { transform: 'translateY(46px) scale(0.3)', opacity: 0 },
      ], { duration: 420, delay: i * 110, easing: 'ease-in', fill: 'forwards' }).onfinish = () => this.fill(slot, undefined);
    });
    if (reward > 0) {
      const coins = document.createElement('span');
      coins.className = 'hud-bag-reward';
      coins.textContent = `+${reward} kr`;
      this.root.append(coins);
      window.setTimeout(() => coins.remove(), 2600);
    }
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => { if (!this.carried.length) this.root.hidden = true; }, 2600 + handed.length * 110);
  }

  /** Nothing more fits: the bag shakes. */
  full(): void {
    this.root.classList.remove('is-shake');
    void this.root.offsetWidth;
    this.root.classList.add('is-shake');
  }

  /** The collection in the discovery book: every kind there is, the ones never found as silhouettes, each one to choose. */
  showCollection(found: string[], kinds: string[]): void {
    this.shown = { found, kinds };
    this.relabel();
    const heading = document.createElement('h3');
    heading.textContent = `${text.lost.collection} · ${found.length}/${kinds.length}`;
    const list = document.createElement('ul');
    for (const kind of kinds) {
      const li = document.createElement('li');
      const known = found.includes(kind);
      if (!known) li.className = 'is-unknown';
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(this.chosen === kind));
      button.setAttribute('aria-label', known ? (text.lost.items as Record<string, string[]>)[kind]?.[0] ?? text.lost.phoneName : text.discover.unknown);
      const img = document.createElement('img');
      img.src = this.icons.get(kind) ?? '';
      img.width = img.height = 44;
      img.alt = '';
      button.append(img);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.chosen = this.chosen === kind ? null : kind;
        this.showCollection(this.shown.found, this.shown.kinds);
        this.collectionView.querySelector<HTMLElement>(`[data-kind="${kind}"]`)?.focus({ preventScroll: true });
      });
      button.dataset.kind = kind;
      li.append(button);
      list.append(li);
    }
    const detail = document.createElement('p');
    detail.className = 'pause-lost-detail';
    detail.setAttribute('aria-live', 'polite');
    const chosen = this.chosen;
    if (chosen === null) detail.textContent = text.lost.pick;
    else if (found.includes(chosen)) detail.textContent = (text.lost.about as Record<string, string>)[chosen] ?? '';
    else detail.textContent = chosen === 'phone' ? text.lost.phoneHint : text.lost.hint;
    detail.classList.toggle('is-hint', chosen === null);
    this.collectionView.replaceChildren(heading, list, detail);
  }

  private fill(slot: HTMLLIElement, kind: string | undefined): void {
    slot.replaceChildren();
    slot.classList.toggle('is-filled', !!kind);
    if (!kind) return;
    const img = document.createElement('img');
    img.src = this.icons.get(kind) ?? '';
    img.alt = this.name(kind);
    slot.append(img);
  }

  private update(show = true): void {
    window.clearTimeout(this.hideTimer);
    if (show) this.root.hidden = this.carried.length === 0;
    this.root.classList.toggle('is-full', this.carried.length >= this.capacity);
    this.relabel();
  }

  /** The count under the bag, in the player's language: also called when the book is drawn again after a language switch. */
  private relabel(): void {
    this.status.textContent = text.lost.bagStatus.replace('{count}', String(this.carried.length)).replace('{capacity}', String(this.capacity));
  }
}
