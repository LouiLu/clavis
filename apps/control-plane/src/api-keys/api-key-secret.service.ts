import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

@Injectable()
export class ApiKeySecretService {
  generate(): { plaintext: string; prefix: string } {
    const visible = randomBytes(6).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const prefix = `pk_live_${visible}`;
    return { prefix, plaintext: `${prefix}.${secret}` };
  }

  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(salt).update(plaintext).digest('hex');
    return `$sha256$${salt}$${hash}`;
  }

  async verify(stored: string, plaintext: string): Promise<boolean> {
    if (stored.startsWith('$argon2')) {
      return argon2.verify(stored, plaintext);
    }

    // Format: $sha256$<salt>$<hash>
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[1] !== 'sha256') {
      return false;
    }
    const [, , salt, expected] = parts;
    const actual = createHash('sha256').update(salt).update(plaintext).digest('hex');
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  }
}
