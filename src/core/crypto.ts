import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function hashToken(token: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${token}`).digest('hex');
}

export function issueToken(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}

export function encryptSecret(value: string, encryptionKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(encryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string, encryptionKey: string): string {
  const [ivRaw, tagRaw, valueRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !valueRaw) {
    throw new Error('Invalid encrypted secret payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(encryptionKey),
    Buffer.from(ivRaw, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(valueRaw, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
