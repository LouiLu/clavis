import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig } from '../config';

export interface SessionPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class SessionTokenService {
  private readonly secret = loadConfig().sessionSecret;

  sign(user: { id: string; email: string }): { accessToken: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 86400;
    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      iat: now,
      exp: now + expiresIn,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.signPayload(encodedPayload);
    return { accessToken: `${encodedPayload}.${signature}`, expiresIn };
  }

  verify(token: string): SessionPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid authorization token');
    }

    const expected = this.signPayload(encodedPayload);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid authorization token');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Authorization token expired');
    }
    return payload;
  }

  private signPayload(encodedPayload: string): string {
    return createHmac('sha256', this.secret).update(encodedPayload).digest('base64url');
  }
}
