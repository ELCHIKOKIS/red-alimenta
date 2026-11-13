import assert from 'node:assert/strict';
import test from 'node:test';
import { hasExpectedProductImageSignature } from './productsController';

test('accepts supported image signatures and rejects mismatched content', () => {
  assert.equal(
    hasExpectedProductImageSignature('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    true,
  );
  assert.equal(
    hasExpectedProductImageSignature(
      'image/png',
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ),
    true,
  );
  assert.equal(
    hasExpectedProductImageSignature(
      'image/webp',
      Buffer.from('RIFF0000WEBP', 'ascii'),
    ),
    true,
  );
  assert.equal(hasExpectedProductImageSignature('image/png', Buffer.from('not an image')), false);
  assert.equal(hasExpectedProductImageSignature('image/gif', Buffer.from('GIF89a')), false);
});
