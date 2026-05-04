import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PasswordService } from './password.service';
import { SessionTokenService } from './session-token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: SessionTokenService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.passwords.verify(user.passwordHash, password);
    const token = this.tokens.sign({ id: user.id, email: user.email });
    return {
      access_token: token.accessToken,
      token_type: 'Bearer',
      expires_in: token.expiresIn,
      user: { id: user.id, email: user.email, display_name: user.displayName },
    };
  }
}
