/** Shared, presentation-independent hex formation geometry for battle, military, and marches. */
export const HEX_GRID_RADIUS = 2.15;

export type HexGridBand = { id: string; rows: number };
export type HexGridLayout = { columns: number; bands: readonly HexGridBand[]; hexGap?: number; radius?: number };
export type HexGridSlot = { id: string; column: number; row: number; band: string; x: number; z: number };

/**
 * Returns a single connected, centered hex board. Bands are consecutive row
 * groups, so a neutral band can divide equal player/enemy formations without
 * changing either formation's dimensions.
 */
export function createHexGridSlots({ columns, bands, hexGap = 0, radius = HEX_GRID_RADIUS }: HexGridLayout): HexGridSlot[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const rows = bands.flatMap(band => Array.from({ length: Math.max(0, Math.floor(band.rows)) }, () => band.id));
  const horizontal = Math.sqrt(3) * radius + hexGap;
  const vertical = radius * 1.5 + hexGap;
  return rows.flatMap((band, row) => Array.from({ length: safeColumns }, (_, column) => ({
    id: `${band}:${row}:${column}`, band, row, column,
    x: (column - (safeColumns - 1) / 2) * horizontal + (row % 2 ? horizontal / 2 : 0),
    z: (row - (rows.length - 1) / 2) * vertical,
  })));
}
