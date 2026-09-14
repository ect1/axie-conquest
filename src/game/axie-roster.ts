export const AXIE_ROSTER_SAVE_KEY = 'axie-conquest-axie-roster-v1';

export type ApiAxiePart = { id: string; name: string; type: string };
export type ApiAxie = { id: string; name: string; class: string; image?: string; newGenes?: string; parts: ApiAxiePart[] };
export type AxieRosterCache = { version: 1; syncedAt: number; axies: ApiAxie[] };

function string(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function imageUrl(value: unknown) {
  const candidate = string(value);
  const markdownUrl = /^\[[^\]]*\]\((https:\/\/[^)]+)\)$/.exec(candidate)?.[1];
  const url = markdownUrl ?? candidate;
  return /^https:\/\//.test(url) ? url : '';
}

export function restoreAxieRoster(value: string | null): AxieRosterCache | null {
  try {
    const saved = JSON.parse(value || 'null') as Partial<AxieRosterCache> | null;
    if (!saved || saved.version !== 1 || !Number.isFinite(saved.syncedAt) || !Array.isArray(saved.axies)) return null;
    const axies = saved.axies.flatMap((item): ApiAxie[] => {
      if (!item || typeof item !== 'object') return [];
      const axie = item as Partial<ApiAxie>;
      const id = string(axie.id), name = string(axie.name), axieClass = string(axie.class);
      if (!id || !name || !axieClass || !Array.isArray(axie.parts)) return [];
      const parts = axie.parts.flatMap((part): ApiAxiePart[] => {
        if (!part || typeof part !== 'object') return [];
        const candidate = part as Partial<ApiAxiePart>;
        const partId = string(candidate.id), partName = string(candidate.name), type = string(candidate.type);
        return partId && partName && type ? [{ id: partId, name: partName, type }] : [];
      });
      const image = imageUrl(axie.image);
      const newGenes = typeof axie.newGenes === 'string' && /^(?:0x)?[0-9a-f]{1,128}$/i.test(axie.newGenes) ? axie.newGenes : undefined;
      return [{ id, name, class: axieClass, ...(image ? { image } : {}), ...(newGenes ? { newGenes } : {}), parts }];
    });
    return { version: 1, syncedAt: saved.syncedAt as number, axies };
  } catch { return null; }
}

export function createAxieRoster(axies: readonly ApiAxie[], syncedAt = Date.now()): AxieRosterCache {
  return { version: 1, syncedAt, axies: axies.map(axie => ({ ...axie, parts: [...axie.parts] })) };
}
