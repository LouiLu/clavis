import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuditLogModule } from './audit/audit-log.module';
import { HealthController } from './health.controller';
import { MeModule } from './me/me.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaService } from './prisma.service';
import { BackendServicesModule } from './services/backend-services.module';

@Module({
  imports: [AuthModule, AuditLogModule, MeModule, OrganizationsModule, BackendServicesModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
