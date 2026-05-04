import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { MeModule } from './me/me.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [AuthModule, MeModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
