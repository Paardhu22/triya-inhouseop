/** A schematic arrangement: paired room rows share a corridor, not a surveyed plan. */
export const ROOM_WIDTH = 212;
export const CORRIDOR_HEIGHT = 38;
export const PLAN_MARGIN = 20;

export function fitFloorPlan(roomCount: number, maxBeds: number, width: number, height: number) {
  const roomHeight = Math.max(184, 76 + Math.ceil(Math.sqrt(maxBeds)) * 52);
  let best = { columns: 1, rows: roomCount, width: 0, height: 0, scale: 0 };
  for (let columns = 1; columns <= roomCount; columns++) {
    const rows = Math.ceil(roomCount / columns);
    const planWidth = columns * ROOM_WIDTH + PLAN_MARGIN * 2;
    const planHeight = rows * roomHeight + Math.ceil(rows / 2) * CORRIDOR_HEIGHT + PLAN_MARGIN * 2;
    const scale = Math.min(width / planWidth, height / planHeight);
    // Prefer the largest readable rooms; break ties by using fewer empty cells.
    if (scale > best.scale || (scale === best.scale && columns * rows < best.columns * best.rows)) {
      best = { columns, rows, width: planWidth, height: planHeight, scale };
    }
  }
  return { ...best, roomHeight };
}
