const KEY = 'under-stockholm:hints';

export type Hint = 'use' | 'sit' | 'pause';

/** Key hints shown once each, the first time they matter, remembered locally. */
export class FirstSteps {
  private readonly shown: Set<string>;

  constructor(private readonly show: (message: string) => void) {
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { /* None yet. */ }
    this.shown = new Set(Array.isArray(saved) ? saved : []);
  }

  /** Shows the hint unless it has been shown before. */
  offer(hint: Hint, message: string): void {
    if (this.shown.has(hint)) return;
    this.shown.add(hint);
    try { localStorage.setItem(KEY, JSON.stringify([...this.shown])); } catch { /* Shown again next time. */ }
    this.show(message);
  }

  has(hint: Hint): boolean {
    return this.shown.has(hint);
  }
}
