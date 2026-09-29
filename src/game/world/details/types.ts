import type { StationDef } from '../../line';
import type { Physics } from '../../physics';
import type { Section } from '../section';

/** Where a station's own details go: what the builder knows of its platform. */
export interface DetailSite {
  s: Section;
  physics: Physics;
  def: StationDef;
  /** The station's middle along x, and the way to its main hall. */
  cx: number;
  exitDir: 1 | -1;
  /** The islands' middles across (z), and whether the station is in the open or a tiled box. */
  islands: readonly number[];
  outdoor: boolean;
  tiled: boolean;
  /** Whether the island is clear for something `half` long either side of `x` (escalators may go through it). */
  free(x: number, half?: number): boolean;
}

/** A station's own objects on its platform: sculptures, showcases, columns, fences between the tracks. */
export type Detail = (site: DetailSite) => void;
