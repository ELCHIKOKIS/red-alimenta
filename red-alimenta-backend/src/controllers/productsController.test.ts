import assert from 'node:assert/strict';
import test from 'node:test';
import { hasExpectedImageSignature } from '../lib/imageValidation';

test('accepts supported image signatures and rejects mismatched content', () => {
  assert.equal(
    hasExpectedImageSignature('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    true,
  );
  assert.equal(
    hasExpectedImageSignature(
      'image/png',
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ),
    true,
  );
  assert.equal(
    hasExpectedImageSignature(
      'image/webp',
      Buffer.from('RIFF0000WEBP', 'ascii'),
    ),
    true,
  );
  assert.equal(hasExpectedImageSignature('image/png', Buffer.from('not an image')), false);
  assert.equal(hasExpectedImageSignature('image/gif', Buffer.from('GIF89a')), false);
});
