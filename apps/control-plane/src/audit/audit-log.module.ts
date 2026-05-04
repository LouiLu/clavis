import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from './audit-log.service';

@Module({
  providers: [AuditLogService, PrismaService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
