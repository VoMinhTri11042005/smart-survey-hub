import type { SurveyDisplayMode, SurveyQuestion, SurveySection } from '../types';

export interface SurveyDraft {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  sections?: SurveySection[];
  isQuiz?: boolean;
  showScore?: boolean;
  displayMode?: SurveyDisplayMode;
  closesAt?: string | null;
  timeLimitMinutes?: number | null;
  maxAttemptsPerDevice?: number | null;
  updatedAt?: string;
  /** Local-cache metadata; it is never included in the draft API payload. */
  syncedAt?: string;
}

export const DRAFT_STORAGE_KEY = 'smart-survey-hub-builder-draft';
export const LEGACY_DRAFT_STORAGE_KEY = 'smart-survey-hub-drafts';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StoredDraft = Record<string, any>;

// Older autosaves did not have an id. Give them a deterministic id so opening,
// saving or deleting one draft cannot accidentally affect a different draft.
function storedDraftId(draft: StoredDraft): string {
  if (typeof draft.id === 'string' && draft.id) return draft.id;
  const text = JSON.stringify(draft);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return `draft-local-${(hash >>> 0).toString(36)}-${text.length.toString(36)}`;
}

function parseStoredDrafts(raw: string | null): StoredDraft[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return (Array.isArray(parsed) ? parsed : [parsed]).filter(
    (item): item is StoredDraft => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

function normalizeStoredDraft(item: StoredDraft): SurveyDraft {
  const limit = (value: unknown) => typeof value === 'number' && value !== 0 ? value : null;
  return {
    id: storedDraftId(item),
    title: item.title || item.surveyTitle || 'Khảo sát nháp',
    description: item.description || item.surveyDescription || '',
    questions: Array.isArray(item.questions) ? item.questions : [],
    sections: Array.isArray(item.sections) ? item.sections : [],
    isQuiz: Boolean(item.isQuiz),
    showScore: item.showScore !== false,
    displayMode: item.displayMode === 'all' ? 'all' : 'single',
    closesAt: item.closesAt || null,
    maxAttemptsPerDevice: limit(item.maxAttemptsPerDevice ?? item.max_attempts_per_device),
    timeLimitMinutes: limit(item.timeLimitMinutes ?? item.time_limit_minutes),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
    syncedAt: typeof item.syncedAt === 'string' ? item.syncedAt : undefined,
  };
}

export function readLocalDrafts(storage: DraftStorage): SurveyDraft[] {
  const collected: SurveyDraft[] = [];
  for (const key of [DRAFT_STORAGE_KEY, LEGACY_DRAFT_STORAGE_KEY]) {
    try {
      const stored = parseStoredDrafts(storage.getItem(key));
      collected.push(...stored
        .filter(item => item.id || item.title || item.surveyTitle || item.description || item.surveyDescription || Array.isArray(item.questions))
        .map(normalizeStoredDraft));
    } catch (error) {
      console.warn('Failed to read local draft storage', error);
    }
  }
  return mergeDrafts([], collected);
}

export function mergeDrafts(serverDrafts: SurveyDraft[], localDrafts: SurveyDraft[], ignoreSyncedMissing = false): SurveyDraft[] {
  const merged = [...serverDrafts];
  for (const local of localDrafts) {
    const index = merged.findIndex(draft => draft.id === local.id);
    if (index < 0) {
      if (!ignoreSyncedMissing || !local.syncedAt) merged.push(local);
      continue;
    }
    const serverTime = Date.parse(merged[index].updatedAt || '') || 0;
    const localTime = Date.parse(local.updatedAt || '') || 0;
    if (!local.syncedAt && localTime > serverTime) merged[index] = local;
  }
  return merged;
}

export function findDraftById(drafts: SurveyDraft[], id: string): SurveyDraft | undefined {
  return drafts.find(draft => draft.id === id);
}

export function sectionsForBuilder(sections?: SurveySection[]): SurveySection[] {
  return sections?.length ? sections : [{ id: 'section-1', title: 'Phần 1' }];
}

export function createDraftId(): string {
  return `draft-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/** Keep saves and deletes for the same draft ordered across builder mounts. */
export function createDraftWriteQueue() {
  const pending = new Map<string, Promise<void>>();
  return {
    run<T>(id: string, action: () => Promise<T>): Promise<T> {
      const previous = pending.get(id) || Promise.resolve();
      const result = previous.then(action);
      const settled = result.then(() => undefined, () => undefined);
      pending.set(id, settled);
      void settled.then(() => {
        if (pending.get(id) === settled) pending.delete(id);
      });
      return result;
    },
  };
}

export function writeLocalDraft(storage: DraftStorage, draft: SurveyDraft): void {
  // Parse both keys before writing so malformed legacy data is never silently
  // overwritten. Keep all other raw records, including older fields we do not use.
  const existing = [
    ...parseStoredDrafts(storage.getItem(DRAFT_STORAGE_KEY)),
    ...parseStoredDrafts(storage.getItem(LEGACY_DRAFT_STORAGE_KEY)),
  ];
  const seen = new Set([draft.id]);
  const otherDrafts = existing.filter(item => {
    const id = storedDraftId(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify([draft, ...otherDrafts]));
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function comparableDraft(draft: SurveyDraft) {
  return {
    id: draft.id,
    title: draft.title || 'Khảo sát nháp',
    description: draft.description || '',
    questions: draft.questions || [],
    sections: draft.sections || [],
    isQuiz: Boolean(draft.isQuiz),
    showScore: draft.showScore !== false,
    displayMode: draft.displayMode || 'single',
    closesAt: draft.closesAt || null,
    maxAttemptsPerDevice: draft.maxAttemptsPerDevice || null,
    timeLimitMinutes: draft.timeLimitMinutes || null,
  };
}

/** Mark only the exact content acknowledged by the server, never newer edits. */
export function markLocalDraftSynced(storage: DraftStorage, saved: SurveyDraft): void {
  const content = JSON.stringify(comparableDraft(saved));
  for (const key of [DRAFT_STORAGE_KEY, LEGACY_DRAFT_STORAGE_KEY]) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const value: unknown = JSON.parse(raw);
    let changed = false;
    const mark = (item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const normalized = normalizeStoredDraft(item as StoredDraft);
      if (normalized.id !== saved.id || JSON.stringify(comparableDraft(normalized)) !== content) return item;
      changed = true;
      return { ...item, syncedAt: new Date().toISOString() };
    };
    const next = Array.isArray(value) ? value.map(mark) : mark(value);
    if (changed) storage.setItem(key, JSON.stringify(next));
  }
}

export function removeLocalDraft(storage: DraftStorage, id: string): void {
  for (const key of [DRAFT_STORAGE_KEY, LEGACY_DRAFT_STORAGE_KEY]) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const next = parsed.filter(item => !item || typeof item !== 'object' || Array.isArray(item) || storedDraftId(item) !== id);
      if (next.length !== parsed.length) {
        if (next.length) storage.setItem(key, JSON.stringify(next));
        else storage.removeItem(key);
      }
    } else if (parsed && typeof parsed === 'object' && storedDraftId(parsed as StoredDraft) === id) {
      storage.removeItem(key);
    }
  }
}
