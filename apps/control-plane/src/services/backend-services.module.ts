import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma.service';
import { BackendServicesController } from './backend-services.controller';
import { BackendServicesService } from './backend-services.service';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [BackendServicesController],
  providers: [BackendServicesService, PrismaService],
})
export class BackendServicesModule {}
