import { CITIES_SAVE_KEY } from './cities';
import { WORLD_SAVE_KEY } from './world';

export const DEFAULT_OWNER = '0xe3bd25a65d180ebb002cbfd8b1c71241227dd183';

/** Persistent key for the user's entered address (preserved across browser sessions & resets). */
export const AXIE_INPUT_OWNER_KEY = 'axie-conquest-owner-address';

/** Resettable key for the owner address associated with the active saved game. */
export const AXIE_SAVED_OWNER_KEY = 'axie-conquest-game-owner';

/** Normalizes a Ronin or Ethereum hex address. */
export function normalizeOwnerAddress(address: unknown): string {
  if (typeof address !== 'string' || !address) return DEFAULT_OWNER;
  let trimmed = address.trim();
  if (trimmed.startsWith('ronin:')) {
    trimmed = '0x' + trimmed.slice(6);
  }
  return trimmed || DEFAULT_OWNER;
}

/** Reads the persisted address from localStorage or falls back to DEFAULT_OWNER. */
export function getPersistedOwner(): string {
  if (typeof window === 'undefined') return DEFAULT_OWNER;
  try {
    const saved = window.localStorage.getItem(AXIE_INPUT_OWNER_KEY);
    return saved ? normalizeOwnerAddress(saved) : DEFAULT_OWNER;
  } catch {
    return DEFAULT_OWNER;
  }
}

/** Persists the entered address in localStorage and cookie for API requests. */
export function setPersistedOwner(address: string): void {
  const normalized = normalizeOwnerAddress(address);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AXIE_INPUT_OWNER_KEY, normalized);
      document.cookie = `axie_owner_address=${encodeURIComponent(normalized)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      /* Storage might be disabled */
    }
  }
}

/** Returns the address associated with the current game save. */
export function getActiveGameOwner(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AXIE_SAVED_OWNER_KEY);
  } catch {
    return null;
  }
}

/** Sets the address associated with the active game save. */
export function setActiveGameOwner(address: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AXIE_SAVED_OWNER_KEY, normalizeOwnerAddress(address));
  } catch {
    /* Storage might be disabled */
  }
}

/** Checks whether a saved game currently exists in storage. */
export function hasExistingGame(storage?: Storage): boolean {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!targetStorage) return false;
  try {
    return Boolean(
      targetStorage.getItem(CITIES_SAVE_KEY) ||
      targetStorage.getItem(AXIE_SAVED_OWNER_KEY) ||
      targetStorage.getItem(WORLD_SAVE_KEY) ||
      targetStorage.getItem('axie-conquest-base-v2') ||
      targetStorage.getItem('axie-conquest-base-v1')
    );
  } catch {
    return false;
  }
}
