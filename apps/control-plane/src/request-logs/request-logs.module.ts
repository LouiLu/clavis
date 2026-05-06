import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InternalIngestController } from './internal-ingest.controller';
import { RequestLogsService } from './request-logs.service';

@Module({
  controllers: [InternalIngestController],
  providers: [RequestLogsService, PrismaService],
})
export class RequestLogsModule {}
