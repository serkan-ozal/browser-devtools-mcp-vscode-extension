/** Tool catalog from tool_catalog.json. */
export type ToolCatalog = {
  version: string;
  tools: Array<{ id: string; name: string; description?: string; category?: string; tags?: string[] }>;
  mappings: Array<{ catalogId: string; source?: string; toolName: string }>;
};

/** Location zone on screen (catalogId -> position). */
export type ZoneMap = Record<string, { x: number; y: number }>;

/** Default zones for known catalog IDs (layout on 800x600). */
export const DEFAULT_ZONES: ZoneMap = {
  web_search: { x: 120, y: 400 },
  content: { x: 400, y: 400 },
  navigation: { x: 340, y: 370 },
  interaction: { x: 680, y: 400 },
};

/** Resolve toolName -> catalogId from catalog mappings. */
export function getCatalogIdForTool(catalog: ToolCatalog | null, toolName: string): string | null {
  if (!catalog?.mappings?.length) return null;
  const m = catalog.mappings.find((mm) => mm.toolName === toolName);
  return m?.catalogId ?? null;
}

/** Get zone position for catalogId; fallback to center if unknown. */
export function getZonePosition(zones: ZoneMap, catalogId: string, defaultX: number, defaultY: number): { x: number; y: number } {
  const z = zones[catalogId];
  return z ? { x: z.x, y: z.y } : { x: defaultX, y: defaultY };
}

let cachedCatalog: ToolCatalog | null = null;

export async function loadToolCatalog(): Promise<ToolCatalog | null> {
  if (cachedCatalog) return cachedCatalog;
  try {
    const res = await fetch('/tool_catalog.json');
    if (!res.ok) return null;
    const data = (await res.json()) as ToolCatalog;
    cachedCatalog = data;
    return data;
  } catch {
    return null;
  }
}
