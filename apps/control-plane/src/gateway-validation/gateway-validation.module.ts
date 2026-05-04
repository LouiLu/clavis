import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { PrismaService } from '../prisma.service';
import { GatewayValidationController } from './gateway-validation.controller';
import { GatewayValidationService } from './gateway-validation.service';

@Module({
  imports: [ApiKeysModule],
  controllers: [GatewayValidationController],
  providers: [GatewayValidationService, PrismaService],
})
export class GatewayValidationModule {}
