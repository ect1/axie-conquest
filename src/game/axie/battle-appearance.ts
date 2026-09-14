import { ApiAxie, AXIE_ROSTER_SAVE_KEY, restoreAxieRoster } from '../axie-roster';
import { Fighter } from '../battle';
import { STARTER_HEROES } from '../heroes';
import type { BabylonAxiePlan } from './babylon-mixer';

async function json(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  if (!response.ok) throw new Error(`Axie asset request failed (${response.status}).`);
  return response.json();
}

/** Per-scene cache: recordings use their snapshot before consulting the current roster. */
export function createBattleAppearanceResolver(signal: AbortSignal) {
  const plans = new Map<string, Promise<BabylonAxiePlan>>();
  let roster: Promise<ApiAxie[]> | undefined;
  const lookup = async () => {
    const axies: ApiAxie[] = [];
    for (let from = 0; ; from += 100) {
      const payload = await json(`/api/axies?size=100&from=${from}`, signal);
      const page = payload.data?.axies;
      if (!Array.isArray(page?.results) || payload.errors?.length) throw new Error('Axie roster lookup failed.');
      axies.push(...page.results);
      if (page.results.length < 100 || axies.length >= page.total) return axies;
    }
  };
  return (fighter: Fighter): Promise<BabylonAxiePlan> => {
    const id = fighter.heroId;
    if (!id) return Promise.reject(new Error('This fighter is a troop.'));
    const key = `${id}:${fighter.appearance?.newGenes ?? ''}`;
    let pending = plans.get(key);
    if (!pending) {
      pending = (async () => {
        let genes = fighter.appearance?.id === id ? fighter.appearance.newGenes : undefined;
        const starter = STARTER_HEROES.find(hero => hero.id === id);
        if (!genes && starter) return json(`/api/axies/decode?starterClass=${starter.class}`, signal);
        if (!genes) {
          try { genes = restoreAxieRoster(localStorage.getItem(AXIE_ROSTER_SAVE_KEY))?.axies.find(axie => axie.id === id)?.newGenes; } catch { /* Storage is optional for old reports. */ }
        }
        if (!genes) {
          roster ??= lookup();
          genes = (await roster).find(axie => axie.id === id)?.newGenes;
        }
        if (!genes) throw new Error(`No genes available for Axie #${id}.`);
        return json(`/api/axies/decode?genes=${encodeURIComponent(genes)}`, signal);
      })();
      plans.set(key, pending);
    }
    return pending;
  };
}
