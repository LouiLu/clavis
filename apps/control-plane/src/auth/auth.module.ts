import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionTokenService } from './session-token.service';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, AuthService, PasswordService, PrismaService, SessionTokenService],
  exports: [AuthGuard, SessionTokenService],
})
export class AuthModule {}
