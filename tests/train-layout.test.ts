import { describe, expect, test } from 'bun:test';
import { C20, C30, CAB_DEPTH, CABIN_DESIGN, DOOR_HALF_W, PLATFORM_HALF_L, SEAT_LAYOUT, TRAIN_HALF_L, TRAIN_JOINT_HALF_W, type Stock } from '../src/game/layout';
import { bodyPanels, cabinSeatLayout, flexAreas, seatBays, unitAisle, wallSegments, type SeatStyle } from '../src/game/trainModel';

const STOCKS: Array<[SeatStyle, Stock]> = [['c20', C20], ['c30', C30]];

for (const [style, stock] of STOCKS) {
  describe(`${stock.id} boarding clearances`, () => {
    test('all door apertures remain clear of fixed walls and seat bays', () => {
      for (const door of stock.doors) {
        for (const [a, b] of [...wallSegments(stock), ...seatBays(style).map((bay) => [bay.a, bay.b])]) {
          const overlap = Math.min(b, door + DOOR_HALF_W) - Math.max(a, door - DOOR_HALF_W);
          expect(overlap).toBeLessThanOrEqual(0.000001);
        }
      }
    });

    test('gangways and cabs do not overlap door openings or seats', () => {
      for (const joint of stock.articulations) {
        for (const door of stock.doors) expect(Math.abs(joint - door)).toBeGreaterThan(DOOR_HALF_W + 0.35);
        for (const { a, b } of seatBays(style)) expect(joint < a || joint > b).toBe(true);
      }
      for (const coupling of stock.couplings) {
        for (const door of stock.doors) expect(Math.abs(coupling - door)).toBeGreaterThan(CAB_DEPTH + DOOR_HALF_W + 0.1);
        for (const { a, b } of seatBays(style)) expect(b < coupling - CAB_DEPTH || a > coupling + CAB_DEPTH).toBe(true);
      }
    });

    test('every section has usable seating and every doorway stops beside the platform', () => {
      expect(new Set(stock.doors).size).toBe(stock.id === 'c20' ? 21 : 24);
      for (const section of stock.sections) {
        expect(seatBays(style).some(({ a, b }) => a >= section.center - section.halfLength && b <= section.center + section.halfLength && b > a)).toBe(true);
      }
      for (const door of stock.doors) expect(Math.abs(door) + DOOR_HALF_W).toBeLessThan(PLATFORM_HALF_L);
      expect(TRAIN_HALF_L + 0.8).toBeLessThan(PLATFORM_HALF_L);
    });

    test('there is no way through where units are coupled, only along a unit', () => {
      for (const coupling of stock.couplings) {
        const before = unitAisle(stock, coupling - CAB_DEPTH - 1);
        const after = unitAisle(stock, coupling + CAB_DEPTH + 1);
        expect(before.b).toBeCloseTo(coupling - CAB_DEPTH);
        expect(after.a).toBeCloseTo(coupling + CAB_DEPTH);
      }
      // Every door opens onto some unit's aisle.
      for (const door of stock.doors) {
        const { a, b } = unitAisle(stock, door);
        expect(door - DOOR_HALF_W).toBeGreaterThan(a);
        expect(door + DOOR_HALF_W).toBeLessThan(b);
      }
    });
  });

  test(`${stock.id} exterior panels leave the gangways and cab ends clear and never overlap each other`, () => {
    const panels = bodyPanels(stock).sort((a, b) => a.a - b.a);
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      expect(panel.b).toBeGreaterThan(panel.a);
      if (i) expect(panel.a).toBeGreaterThanOrEqual(panels[i - 1].b);
      for (const joint of [...stock.articulations, ...stock.couplings]) {
        const overlap = Math.min(panel.b, joint + TRAIN_JOINT_HALF_W) - Math.max(panel.a, joint - TRAIN_JOINT_HALF_W);
        expect(overlap).toBeLessThanOrEqual(0.000001);
      }
      for (const door of stock.doors) {
        expect(Math.min(panel.b, door + DOOR_HALF_W) - Math.max(panel.a, door - DOOR_HALF_W)).toBeLessThanOrEqual(0.000001);
      }
    }
  });

  describe(`the ${stock.id} seating`, () => {
    const seats = cabinSeatLayout(style);
    /** Stretches of floor between two doors of one section. */
    const between = stock.sections.flatMap((section) => section.doors.slice(1).map((d, i) => [section.doors[i], d] as const));

    test('between two doors a row of side seats on one wall and groups of four on the other, the walls taking turns', () => {
      for (const s of seats) {
        if (s.kind === 'side') {
          expect(s.fx).toBe(0);
          expect(s.fz).toBe(-Math.sign(s.z));
        } else {
          expect(Math.abs(s.fx)).toBe(1);
          expect(s.fz).toBe(0);
        }
      }
      const rowWalls = new Set<number>();
      for (const [d0, d1] of between) {
        const inside = seats.filter((s) => s.x > d0 && s.x < d1);
        const row = inside.filter((s) => s.kind === 'side');
        const groups = inside.filter((s) => s.kind === 'facing');
        expect(new Set(row.map((s) => Math.sign(s.z))).size).toBe(1);
        expect(new Set(groups.map((s) => Math.sign(s.z))).size).toBe(1);
        expect(Math.sign(row[0].z)).toBe(-Math.sign(groups[0].z));
        expect(row.length).toBeGreaterThanOrEqual(4);
        expect(row.length).toBeLessThanOrEqual(SEAT_LAYOUT.sideRow);
        expect(groups.length % 4).toBe(0);
        expect(groups.filter((s) => s.fx > 0).length).toBe(groups.length / 2);
        rowWalls.add(Math.sign(row[0].z));
      }
      expect(rowWalls.size).toBe(2);
    });

    test('every row of side seats has one yellow priority seat, the one by a door', () => {
      const rows = new Map<string, typeof seats>();
      for (const s of seats.filter((s) => s.kind === 'side')) {
        const bay = seatBays(style).find((b) => s.x > b.a && s.x < b.b && Math.sign(s.z) === b.side)!;
        const key = `${bay.a}:${bay.side}`;
        rows.set(key, [...(rows.get(key) ?? []), s]);
      }
      expect(rows.size).toBeGreaterThan(10);
      for (const row of rows.values()) {
        const priority = row.filter((s) => s.priority);
        expect(priority.length).toBe(1);
        const nearest = Math.min(...stock.doors.map((d) => Math.abs(d - priority[0].x)));
        expect(nearest).toBeLessThan(SEAT_LAYOUT.column + SEAT_LAYOUT.sidePitch * 1.5);
      }
    });

    test('every gangway has a flex area beside it, and by every cab a row of seats along each wall', () => {
      for (const joint of stock.articulations) {
        expect(flexAreas(style).some(({ a, b }) => Math.min(Math.abs(a - joint), Math.abs(b - joint)) < 0.6)).toBe(true);
      }
      for (const { a, b } of flexAreas(style)) expect(b - a).toBeGreaterThanOrEqual(SEAT_LAYOUT.flexMin);
      // The cabs at the train's ends and both sides of every coupling.
      const cabs = [-(TRAIN_HALF_L - CAB_DEPTH), TRAIN_HALF_L - CAB_DEPTH, ...stock.couplings.flatMap((c) => [c - CAB_DEPTH, c + CAB_DEPTH])];
      for (const cab of cabs) {
        const byCab = seats.filter((s) => Math.abs(s.x - cab) < 3);
        for (const wall of [-1, 1]) expect(byCab.filter((s) => Math.sign(s.z) === wall).length).toBeGreaterThanOrEqual(2);
      }
    });

    test('seats never overlap each other, a flex area or a door column', () => {
      const footprint = (s: (typeof seats)[number]) => {
        const along = s.kind === 'facing' ? CABIN_DESIGN.cushionDepth : CABIN_DESIGN.sideWidth;
        return [s.x - along / 2, s.x + along / 2] as const;
      };
      for (const s of seats) {
        const [a, b] = footprint(s);
        for (const o of seats) {
          if (o === s || Math.sign(o.z) !== Math.sign(s.z)) continue;
          const [oa, ob] = footprint(o);
          const across = Math.abs(o.z - s.z) < 0.3;
          if (across) expect(Math.min(b, ob) - Math.max(a, oa)).toBeLessThanOrEqual(1e-6);
        }
        for (const f of flexAreas(style)) if (f.side === Math.sign(s.z)) expect(Math.min(b, f.b) - Math.max(a, f.a)).toBeLessThanOrEqual(1e-6);
        if (s.kind !== 'facing') for (const d of stock.doors) expect(Math.abs(s.x - d)).toBeGreaterThanOrEqual(SEAT_LAYOUT.column);
      }
    });
  });
}

test('the older stock keeps its groups of four all along, with no side seats or flex areas', () => {
  for (const [style, modern, stock] of [['classic', 'c20', C20], ['classic30', 'c30', C30]] as const) {
    const seats = cabinSeatLayout(style);
    // The renovated C20 gave up seats for standing room; the C30, with its wide gangways, has fewer than the old cars would.
    if (stock === C20) expect(seats.length).toBeGreaterThan(cabinSeatLayout(modern).length);
    else expect(seats.length).toBeGreaterThan(100);
    for (const s of seats) {
      expect(s.kind).toBe('facing');
      expect(s.priority).toBe(false);
    }
    expect(flexAreas(style)).toHaveLength(0);
    // Both walls between every pair of doors have seats.
    for (const section of stock.sections) {
      for (let i = 1; i < section.doors.length; i++) {
        for (const wall of [-1, 1]) {
          expect(seats.some((s) => s.x > section.doors[i - 1] && s.x < section.doors[i] && Math.sign(s.z) === wall)).toBe(true);
        }
      }
    }
    for (const door of stock.doors) {
      for (const { a, b } of seatBays(style)) expect(Math.min(b, door + DOOR_HALF_W) - Math.max(a, door - DOOR_HALF_W)).toBeLessThanOrEqual(1e-6);
    }
  }
});
