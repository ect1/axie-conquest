import { TroopKind } from './base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrainingJob = {
  id: string;          // buildingId (unique per building instance)
  buildingId: string;  // specific building performing the training
  kind: TroopKind;     // 'infantry' | 'archer'
  buildingKind: string;// 'barracks' | 'archery'
  startedAt: number;   // Date.now() when training began
  durationMs: number;  // total duration in milliseconds
  endsAt: number;      // startedAt + durationMs
};

/** Keyed by buildingId so multiple buildings of the same kind can train concurrently. */
export type TrainingQueue = Map<string, TrainingJob>;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const TRAINING_QUEUE_SAVE_KEY = 'axie-conquest-training-queue-v1';

export function serializeQueue(queue: TrainingQueue): string {
  return JSON.stringify(Array.from(queue.entries()));
}

export function restoreQueue(raw: string | null, now = Date.now()): TrainingQueue {
  const map: TrainingQueue = new Map();
  if (!raw) return map;
  try {
    const entries = JSON.parse(raw) as Array<[string, any]>;
    for (const [key, job] of entries) {
      if (job && typeof job.endsAt === 'number' && job.endsAt > now) {
        const buildingId = job.buildingId ?? key;
        map.set(buildingId, {
          id: buildingId,
          buildingId,
          kind: job.kind,
          buildingKind: job.buildingKind ?? (job.kind === 'archer' ? 'archery' : 'barracks'),
          startedAt: job.startedAt,
          durationMs: job.durationMs,
          endsAt: job.endsAt,
        });
      }
    }
  } catch {
    // corrupt save — start fresh
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns seconds remaining for a job (clamped ≥ 0). */
export function secondsRemaining(job: TrainingJob, now: number): number {
  return Math.max(0, Math.ceil((job.endsAt - now) / 1000));
}

/** Returns a 0–1 progress value (0 = just started, 1 = done). */
export function jobProgress(job: TrainingJob, now: number): number {
  if (job.durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, (now - job.startedAt) / job.durationMs));
}

/** Enqueue a training job on a specific building. */
export function enqueueJob(
  queue: TrainingQueue,
  buildingId: string,
  kind: TroopKind,
  buildingKind: string,
  durationMs: number,
  now = Date.now(),
): TrainingQueue {
  const next = new Map(queue);
  next.set(buildingId, {
    id: buildingId,
    buildingId,
    kind,
    buildingKind,
    startedAt: now,
    durationMs,
    endsAt: now + durationMs,
  });
  return next;
}

/** Remove completed jobs from the queue; returns removed jobs and new queue. */
export function drainFinished(
  queue: TrainingQueue,
  now = Date.now(),
): { next: TrainingQueue; finished: TrainingJob[] } {
  const next: TrainingQueue = new Map();
  const finished: TrainingJob[] = [];
  Array.from(queue.entries()).forEach(([buildingId, job]) => {
    if (job.endsAt <= now) finished.push(job);
    else next.set(buildingId, job);
  });
  return { next, finished };
}

/** Finds an idle building among placed buildings for a required building kind. */
export function findIdleBuilding(
  buildings: { id: string; kind: string; level?: number }[],
  queue: TrainingQueue,
  requiredBuildingKind: string,
): { id: string; kind: string; level?: number } | undefined {
  return buildings
    .filter(b => b.kind === requiredBuildingKind && !queue.has(b.id))
    .sort((a, b) => (b.level ?? 1) - (a.level ?? 1))[0];
}

/** Gets all active training jobs for a given troop kind. */
export function getActiveJobsForTroop(queue: TrainingQueue, kind: TroopKind): TrainingJob[] {
  return Array.from(queue.values()).filter(j => j.kind === kind);
}

/** Gets all active training jobs for a given building kind. */
export function getActiveJobsForBuilding(queue: TrainingQueue, buildingKind: string): TrainingJob[] {
  return Array.from(queue.values()).filter(j => j.buildingKind === buildingKind);
}
