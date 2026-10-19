import { describe, expect, it } from 'vitest';
import { fingerprintImportFile } from './importFileFingerprint';

describe('import file fingerprint', () => {
  it('uses the exact file bytes and is stable across selections', async () => {
    const bytes = new TextEncoder().encode('name,answer\nAn,yes\n').buffer;
    const sameBytes = new TextEncoder().encode('name,answer\nAn,yes\n').buffer;
    const changedBytes = new TextEncoder().encode('name,answer\nAn,no\n').buffer;

    const first = await fingerprintImportFile(bytes);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await fingerprintImportFile(sameBytes)).toBe(first);
    expect(await fingerprintImportFile(changedBytes)).not.toBe(first);
  });
});
