import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { AppError } from './errors';
import { createAccessToken, hashPassword, verifyAccessToken, verifyPassword } from './auth';

before(() => {
  process.env.JWT_SECRET = 'unit-test-secret-that-is-at-least-32-bytes';
});

test('password hashes verify without storing the original password', async () => {
  const password = 'a-long-test-password';
  const encodedHash = await hashPassword(password);

  assert.notEqual(encodedHash, password);
  assert.equal(await verifyPassword(password, encodedHash), true);
  assert.equal(await verifyPassword('a-different-password', encodedHash), false);
  assert.equal(await verifyPassword(password, 'invalid-hash'), false);
});

test('signed access tokens expose only validated session claims', () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const token = createAccessToken(17, 'session-identifier', expiresAt);

  assert.deepEqual(verifyAccessToken(token), {
    sub: '17',
    sid: 'session-identifier',
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  const [header, payload, signature] = token.split('.');
  const invalidSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  assert.throws(() => verifyAccessToken(`${header}.${payload}.${invalidSignature}`), AppError);
});

test('expired access tokens are rejected', () => {
  const token = createAccessToken(17, 'session-identifier', new Date(Date.now() - 1000));
  assert.throws(() => verifyAccessToken(token), AppError);
});
