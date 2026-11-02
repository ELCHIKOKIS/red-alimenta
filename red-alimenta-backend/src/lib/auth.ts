import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  exp: number;
}

function getJwtSecret(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  return Buffer.from(secret, 'utf8');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = encodedHash.split('$');
  if (
    algorithm !== 'scrypt'
    || !/^[a-f0-9]{32}$/i.test(saltHex ?? '')
    || !/^[a-f0-9]{128}$/i.test(keyHex ?? '')
  ) {
    return false;
  }

  const expectedKey = Buffer.from(keyHex, 'hex');
  const actualKey = await deriveKey(password, Buffer.from(saltHex, 'hex'));

  return timingSafeEqual(actualKey, expectedKey);
}

export function createAccessToken(userId: number, sessionId: string, expiresAt: Date): string {
  const secret = getJwtSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: String(userId),
    sid: sessionId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  })).toString('base64url');
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');
  return `${unsignedToken}.${signature}`;
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AppError('Invalid or expired access token', 401);
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }

  if (
    !header
    || typeof header !== 'object'
    || (header as Record<string, unknown>).alg !== 'HS256'
    || (header as Record<string, unknown>).typ !== 'JWT'
    || !claims
    || typeof claims !== 'object'
  ) {
    throw new AppError('Invalid or expired access token', 401);
  }

  const secret = getJwtSecret();
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }
  if (
    suppliedSignature.length !== expectedSignature.length
    || !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new AppError('Invalid or expired access token', 401);
  }

  const parsedClaims = claims as Record<string, unknown>;
  const userId = Number(parsedClaims.sub);
  const exp = Number(parsedClaims.exp);
  if (
    !Number.isSafeInteger(userId)
    || userId <= 0
    || typeof parsedClaims.sid !== 'string'
    || parsedClaims.sid.length === 0
    || !Number.isSafeInteger(exp)
    || exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new AppError('Invalid or expired access token', 401);
  }

  return { sub: String(userId), sid: parsedClaims.sid, exp };
}

export function getAccessTokenLifetimeSeconds(): number {
  const configuredLifetime = process.env.JWT_TTL_SECONDS;
  if (configuredLifetime === undefined) {
    return 8 * 60 * 60;
  }

  const lifetime = Number(configuredLifetime);
  if (!Number.isSafeInteger(lifetime) || lifetime < 300 || lifetime > 24 * 60 * 60) {
    throw new Error('JWT_TTL_SECONDS must be an integer between 300 and 86400');
  }
  return lifetime;
}
