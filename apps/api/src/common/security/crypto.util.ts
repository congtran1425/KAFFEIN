import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export class CryptoUtil {
  static sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  static hmacSha256(key: string, data: string): string {
    return createHmac('sha256', key).update(data).digest('hex');
  }

  static async hashPin(pin: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(pin, salt, 32)) as Buffer;
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  static async verifyPin(pin: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const salt = parts[1];
    const key = Buffer.from(parts[2], 'hex');
    const derivedKey = (await scryptAsync(pin, salt, 32)) as Buffer;
    if (key.length !== derivedKey.length) {
      return false;
    }
    return timingSafeEqual(key, derivedKey);
  }

  static generateActivationCode(): {
    fullCode: string;
    codeLookup: string;
    secret: string;
    secretHash: string;
  } {
    const codeLookup = randomBytes(4).toString('hex').toUpperCase(); // 8 chars
    const secret = randomBytes(16).toString('hex'); // 32 chars
    const fullCode = `${codeLookup}.${secret}`;
    const secretHash = this.sha256(secret);
    return { fullCode, codeLookup, secret, secretHash };
  }

  static verifySecret(secret: string, storedHash: string): boolean {
    const hash = this.sha256(secret);
    const bufA = Buffer.from(hash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  static signJwt(
    payload: Record<string, any>,
    secret: string,
    expiresInSeconds = 86400,
  ): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString(
      'base64url',
    );
    const message = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', secret)
      .update(message)
      .digest('base64url');
    return `${message}.${signature}`;
  }

  static verifyJwt<T = any>(token: string, secret: string): T {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('JWT format invalid');
    }
    const [headerB64, payloadB64, sigB64] = parts;
    const message = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac('sha256', secret)
      .update(message)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(sigB64);
    if (
      expectedBuf.length !== actualBuf.length ||
      !timingSafeEqual(expectedBuf, actualBuf)
    ) {
      throw new Error('JWT signature invalid');
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('JWT token expired');
    }
    return payload as T;
  }
}
