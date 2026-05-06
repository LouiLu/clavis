import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma.service';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [PrismaService],
})
export class MeModule {}
