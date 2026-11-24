import { describe, expect, it } from 'vitest';
import { missingIndexLink } from './index';

describe('missingIndexLink', () => {
  it('extracts the console link from a Firestore missing-index error', () => {
    const msg =
      'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=Ckl3cHJv';
    expect(missingIndexLink(msg)).toBe('https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=Ckl3cHJv');
  });
  it('handles the "currently building" variant', () => {
    const msg = 'The query requires an index. That index is currently building and cannot be used yet. See its status here: https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=X.';
    expect(missingIndexLink(msg)).toBe('https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=X');
  });
  it('ignores other errors', () => {
    expect(missingIndexLink('Missing or insufficient permissions.')).toBeNull();
    expect(missingIndexLink(undefined)).toBeNull();
  });
});
