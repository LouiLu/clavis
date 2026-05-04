import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async verify(hash: string, plaintext: string): Promise<void> {
    const ok = await argon2.verify(hash, plaintext);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
  }
}
