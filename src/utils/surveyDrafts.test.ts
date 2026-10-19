import { describe, expect, it } from 'vitest';
import {
  DRAFT_STORAGE_KEY,
  LEGACY_DRAFT_STORAGE_KEY,
  findDraftById,
  markLocalDraftSynced,
  mergeDrafts,
  readLocalDrafts,
  removeLocalDraft,
  sectionsForBuilder,
  writeLocalDraft,
  type SurveyDraft,
} from './surveyDrafts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function draft(id: string, title = id, updatedAt?: string): SurveyDraft {
  return { id, title, description: '', questions: [], updatedAt };
}

describe('survey draft selection and local storage', () => {
  it('opens the requested draft even when another draft is newer', () => {
    const newest = draft('newest');
    const older = draft('older');
    expect(findDraftById([newest, older], 'older')).toEqual(older);
    expect(findDraftById([newest, older], 'missing')).toBeUndefined();
  });

  it('retains all saved sections and provides a default only for older data', () => {
    const sections = [{ id: 'intro', title: 'Introduction' }, { id: 'follow-up', title: 'Follow up', description: 'More details' }];
    expect(sectionsForBuilder(sections)).toEqual(sections);
    expect(sectionsForBuilder([])).toEqual([{ id: 'section-1', title: 'Phần 1' }]);
    expect(sectionsForBuilder()).toEqual([{ id: 'section-1', title: 'Phần 1' }]);
  });

  it('preserves existing drafts when the current draft is saved', () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft('a', 'First')));
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify([draft('a', 'First'), draft('b', 'Second')]));

    writeLocalDraft(storage, draft('c', 'Third'));
    expect(readLocalDrafts(storage).map(item => item.id)).toEqual(['c', 'a', 'b']);
    writeLocalDraft(storage, draft('c', 'Third updated'));
    expect(readLocalDrafts(storage).map(item => [item.id, item.title])).toEqual([
      ['c', 'Third updated'], ['a', 'First'], ['b', 'Second'],
    ]);
  });

  it('deletes only the requested draft and leaves another current snapshot intact', () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft('b')));
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify([draft('a'), draft('b'), draft('c')]));

    removeLocalDraft(storage, 'a');
    expect(JSON.parse(storage.getItem(DRAFT_STORAGE_KEY)!)).toEqual(draft('b'));
    expect(readLocalDrafts(storage).map(item => item.id)).toEqual(['b', 'c']);
    removeLocalDraft(storage, 'b');
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(readLocalDrafts(storage).map(item => item.id)).toEqual(['c']);
  });

  it('assigns stable ids to old id-less autosaves and removes only the chosen one', () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ surveyTitle: 'Old title', surveyDescription: 'Old description', questions: [] }));
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify([{ surveyTitle: 'Another old title', questions: [] }]));

    const firstRead = readLocalDrafts(storage);
    expect(firstRead.map(item => item.id)).toEqual(readLocalDrafts(storage).map(item => item.id));
    expect(firstRead[0]).toMatchObject({ title: 'Old title', description: 'Old description' });
    removeLocalDraft(storage, firstRead[0].id);
    expect(readLocalDrafts(storage).map(item => item.title)).toEqual(['Another old title']);
  });

  it('merges server drafts with local-only drafts and uses the newest copy', () => {
    const server = [draft('a', 'Server copy', '2026-01-01T00:00:00.000Z'), draft('b', 'New server', '2026-01-03T00:00:00.000Z')];
    const local = [draft('a', 'New local', '2026-01-02T00:00:00.000Z'), draft('b', 'Old local', '2026-01-01T00:00:00.000Z'), draft('c', 'Local only')];
    expect(mergeDrafts(server, local).map(item => item.title)).toEqual(['New local', 'New server', 'Local only']);
  });

  it('keeps a synchronized offline copy without resurrecting a remotely deleted draft', () => {
    const storage = memoryStorage();
    const original = draft('a', 'Saved', '2026-01-01T00:00:00.000Z');
    writeLocalDraft(storage, original);
    markLocalDraftSynced(storage, original);

    const local = readLocalDrafts(storage);
    expect(local[0].syncedAt).toBeTruthy();
    expect(mergeDrafts([], local, true)).toEqual([]);
    expect(local.map(item => item.id)).toEqual(['a']); // still usable offline
    expect(mergeDrafts([draft('a', 'Updated elsewhere')], local, true)[0].title).toBe('Updated elsewhere');
  });

  it('does not mark newer local edits as synchronized by an older save', () => {
    const storage = memoryStorage();
    const sent = draft('a', 'Sent', '2026-01-01T00:00:00.000Z');
    const newer = draft('a', 'Newer edit', '2026-01-02T00:00:00.000Z');
    writeLocalDraft(storage, newer);
    markLocalDraftSynced(storage, sent);

    const local = readLocalDrafts(storage);
    expect(local[0].syncedAt).toBeUndefined();
    expect(mergeDrafts([], local, true)[0].title).toBe('Newer edit');
  });

  it('does not overwrite malformed legacy storage when saving another draft', () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft('a')));
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, '{invalid');
    expect(() => writeLocalDraft(storage, draft('b'))).toThrow();
    expect(storage.getItem(LEGACY_DRAFT_STORAGE_KEY)).toBe('{invalid');
    expect(JSON.parse(storage.getItem(DRAFT_STORAGE_KEY)!)).toEqual(draft('a'));
  });
});
