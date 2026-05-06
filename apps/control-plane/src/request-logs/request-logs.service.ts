import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface IngestEntry {
  api_key_id: string;
  organization_id: string;
  service_id: string;
  service_slug: string;
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
  timestamp: string;
  rejection_reason?: string;
}

@Injectable()
export class RequestLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestBatch(entries: IngestEntry[]): Promise<{ accepted: number }> {
    await this.prisma.requestLog.createMany({
      data: entries.map((e) => ({
        apiKeyId: e.api_key_id,
        organizationId: e.organization_id,
        serviceId: e.service_id,
        serviceSlug: e.service_slug,
        method: e.method,
        path: e.path,
        statusCode: e.status_code,
        latencyMs: e.latency_ms,
        timestamp: new Date(e.timestamp),
        rejectionReason: e.rejection_reason ?? null,
      })),
    });

    return { accepted: entries.length };
  }
}
