import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { RequestLogsService, IngestEntry } from './request-logs.service';

@Controller('internal/v1/request-logs')
export class InternalIngestController {
  constructor(private readonly requestLogs: RequestLogsService) {}

  @Post('ingest')
  async ingest(@Body() body: { entries?: IngestEntry[] }) {
    if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
      throw new BadRequestException('entries must be a non-empty array');
    }
    if (body.entries.length > 1000) {
      throw new BadRequestException('entries array must not exceed 1000 items');
    }
    return this.requestLogs.ingestBatch(body.entries);
  }
}
