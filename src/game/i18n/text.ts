import sv from './sv.json';
import en from './en.json';
import type { Lang } from '../../lang';

/**
 * Strings for menus, help, settings and the controls, in the player's language.
 * en.json only overrides those keys: everything in the world (signs, announcements, boards, what people say) stays
 * Swedish, so modules that draw or speak the world import sv.json directly, and what is said to the player reads this.
 * `text` is changed in place by `setLang`, so a module reading it at the time of use always gets the current language;
 * anything built once (the HUD, the touch buttons) relabels itself.
 */
export const text: typeof sv = structuredClone(sv);

let current: Lang = 'sv';

export const lang = (): Lang => current;

type Tree = { [key: string]: unknown };

/** Copies `from` onto `into`, key by key, so objects held elsewhere (`text.touch`) stay the same objects. */
function overlay(into: Tree, from: Tree): void {
  for (const [key, value] of Object.entries(from)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && into[key] && typeof into[key] === 'object') overlay(into[key] as Tree, value as Tree);
    else into[key] = structuredClone(value);
  }
}

export function setLang(next: Lang): void {
  current = next;
  overlay(text as Tree, sv as Tree);
  if (next === 'en') overlay(text as Tree, en as Tree);
}

/** The text at a dotted path, e.g. `touch.sound`. */
export function lookup(path: string): string {
  const value = path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], text);
  return typeof value === 'string' ? value : path;
}

/** Fills everything under `root` marked with `data-t` (text), `data-t-title` or `data-t-label` (aria-label) from its path. */
export function label(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = lookup(el.dataset.t!);
  for (const el of root.querySelectorAll<HTMLElement>('[data-t-title]')) el.title = lookup(el.dataset.tTitle!);
  for (const el of root.querySelectorAll<HTMLElement>('[data-t-label]')) el.setAttribute('aria-label', lookup(el.dataset.tLabel!));
}

let swedishPaths: Map<string, string> | null = null;

/**
 * A Swedish string from sv.json in the player's language: for names the world keeps in Swedish because something else
 * is keyed by them (a zone's label, which the places explored are saved under), shown in the HUD as the player reads.
 * Anything not found in sv.json is returned as it is.
 */
export function inLanguage(swedish: string): string {
  if (!swedishPaths) {
    swedishPaths = new Map();
    const walk = (node: Tree, path: string) => {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string') { if (!swedishPaths!.has(value)) swedishPaths!.set(value, path + key); }
        else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value as Tree, `${path}${key}.`);
      }
    };
    walk(sv as Tree, '');
  }
  const path = swedishPaths.get(swedish);
  return path ? lookup(path) : swedish;
}
