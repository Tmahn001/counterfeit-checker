import { describe, expect, it } from 'vitest';
import { MAX_PHOTOS, MIN_PHOTOS, uploadHint } from './referencePhotos';

describe('uploadHint', () => {
  it('asks for a product first, then counts down to the minimum', () => {
    expect(uploadHint(false, 7)).toMatchObject({ ready: false, key: 'chooseProduct' });
    expect(uploadHint(true, 1)).toEqual({ ready: false, key: 'needMore', missing: MIN_PHOTOS - 1 });
    expect(uploadHint(true, MIN_PHOTOS - 1)).toEqual({ ready: false, key: 'needMore', missing: 1 });
    expect(uploadHint(true, MIN_PHOTOS)).toEqual({ ready: true, key: 'ready', missing: 0 });
    expect(uploadHint(true, MAX_PHOTOS)).toMatchObject({ ready: true });
    expect(uploadHint(true, MAX_PHOTOS + 1)).toMatchObject({ ready: false, key: 'tooMany' });
  });
});
