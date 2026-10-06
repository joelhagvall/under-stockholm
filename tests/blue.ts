// The blue line's services on their own, as the game runs them (`networkSlots` in boot.ts), for the tests of what
// meets its trains: Silverpilen, the empty train, the summer timetable.
import { BLUE_LINE, layoutLines, lineTimetables } from '../src/game/line';
import { Operations } from '../src/game/operations';
import { serviceSlots } from '../src/game/routes';

const layout = layoutLines([BLUE_LINE]);
export const blue = lineTimetables(layout, 0, BLUE_LINE.trains);
export const blueOperations = () => new Operations({ slots: serviceSlots([BLUE_LINE], layout, [blue]), timetables: blue.timetables });
/** Seconds between two trains on the trunk, as the game gives Silverpilen. */
export const trunkHeadway = blue.headway / BLUE_LINE.routes.length;
