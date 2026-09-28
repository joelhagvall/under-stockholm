/** The language of menus, help and settings. In-world text (signs, announcements, boards) is always Swedish. */
export type Lang = 'sv' | 'en';

const KEY = 'under-stockholm:lang';

/** The player's choice if they made one, otherwise Swedish. */
export function chosenLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'sv' || saved === 'en') return saved;
  } catch { /* No choice kept. */ }
  return 'sv';
}

export function saveLang(lang: Lang): void {
  try { localStorage.setItem(KEY, lang); } catch { /* Session only. */ }
}
