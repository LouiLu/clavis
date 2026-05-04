import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionTokenService } from './session-token.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: SessionTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: { id: string; email: string } }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization token');
    }
    const payload = this.tokens.verify(header.slice('Bearer '.length));
    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
