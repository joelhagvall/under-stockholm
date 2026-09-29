/**
 * The name of a station's street file (`osm/streets/<key>.json`, written by `scripts/osm-streets.ts`), shared by the
 * script and the game, so no three.js here. Underground a station has one per end it may come out at (`px` toward +x,
 * `nx` toward -x); in the open one, round the station itself.
 */
export function streetKey(line: string, name: string, end: 1 | -1 | null): string {
  const slug = name.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${line}-${slug}${end === null ? '' : end > 0 ? '-px' : '-nx'}`;
}
