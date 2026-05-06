import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma.service';
import { ApiKeySecretService } from './api-key-secret.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [ApiKeysController],
  providers: [ApiKeySecretService, ApiKeysService, PrismaService],
  exports: [ApiKeySecretService, ApiKeysService],
})
export class ApiKeysModule {}
