import { Module } from '@nestjs/common';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { AuditLogModule } from './audit/audit-log.module';
import { HealthController } from './health.controller';
import { GatewayValidationModule } from './gateway-validation/gateway-validation.module';
import { MeModule } from './me/me.module';
import { MetricsModule } from './metrics/metrics.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaService } from './prisma.service';
import { RequestLogsModule } from './request-logs/request-logs.module';
import { BackendServicesModule } from './services/backend-services.module';

@Module({
  imports: [
    ApiKeysModule,
    AuthModule,
    AuditLogModule,
    GatewayValidationModule,
    MeModule,
    MetricsModule,
    OrganizationsModule,
    RequestLogsModule,
    BackendServicesModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
