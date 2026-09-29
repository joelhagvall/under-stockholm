import { BLUE_DETAILS } from './blue';
import { GREEN_DETAILS } from './green';
import { RED_DETAILS } from './red';
import type { DetailSite } from './types';

const BY_LINE: Record<string, Record<string, (site: DetailSite) => void>> = { blue: BLUE_DETAILS, red: RED_DETAILS, green: GREEN_DETAILS };

/** Builds a station's own details, if its line has any for it. */
export function stationOwnDetails(lineId: string, site: DetailSite): void {
  BY_LINE[lineId]?.[site.def.name]?.(site);
}
