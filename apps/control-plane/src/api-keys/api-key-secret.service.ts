import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

@Injectable()
export class ApiKeySecretService {
  generate(): { plaintext: string; prefix: string } {
    const visible = randomBytes(6).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const prefix = `pk_live_${visible}`;
    return { prefix, plaintext: `${prefix}.${secret}` };
  }

  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext);
  }

  verify(hash: string, plaintext: string): Promise<boolean> {
    return argon2.verify(hash, plaintext);
  }
}
