/** Location zone on screen (catalogId -> position). */
export type ZoneMap = Record<string, { x: number; y: number }>;

/** Default zones for known catalog IDs (layout on 800x600). */
export const DEFAULT_ZONES: ZoneMap = {
  web_search: { x: 120, y: 400 },
  content: { x: 400, y: 400 },
  navigation: { x: 340, y: 370 },
  interaction: { x: 680, y: 400 },
};

/** Get zone position for catalogId; fallback to center if unknown. */
export function getZonePosition(zones: ZoneMap, catalogId: string, defaultX: number, defaultY: number): { x: number; y: number } {
  const z = zones[catalogId];
  return z ? { x: z.x, y: z.y } : { x: defaultX, y: defaultY };
}
