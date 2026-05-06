import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface KeyBreakdown {
  key_id: string;
  key_prefix: string;
  requests: number;
}

export interface UsageBucket {
  bucket: string;
  requests: number;
  avg_latency_ms: number;
  keys?: KeyBreakdown[];
}

export interface MetricsOverview {
  total_requests: number;
  unique_keys: number;
  active_services: number;
  items: Array<{ day: string; requests: number }>;
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(days: number): Promise<MetricsOverview> {
    const result: Array<{
      total_requests: number;
      unique_keys: number;
      active_services: number;
    }> = await this.prisma.$queryRawUnsafe(
      `SELECT
        COUNT(*)::int AS total_requests,
        COUNT(DISTINCT api_key_id)::int AS unique_keys,
        COUNT(DISTINCT service_id)::int AS active_services
      FROM request_logs
      WHERE timestamp >= NOW() - INTERVAL '1 day' * $1`,
      days,
    );

    const summary = result[0] ?? { total_requests: 0, unique_keys: 0, active_services: 0 };

    const items: Array<{ day: string; requests: number }> = await this.prisma.$queryRawUnsafe(
      `SELECT
        DATE(timestamp)::text AS day,
        COUNT(*)::int AS requests
      FROM request_logs
      WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(timestamp)
      ORDER BY day ASC`,
      days,
    );

    return {
      total_requests: summary.total_requests,
      unique_keys: summary.unique_keys,
      active_services: summary.active_services,
      items,
    };
  }

  async serviceUsage(
    serviceId: string,
    days: number,
    resolution: 'hour' | 'day',
    includeKeys?: boolean,
  ): Promise<{ items: UsageBucket[] }> {
    this.validateResolution(resolution);

    const items: UsageBucket[] = await this.prisma.$queryRawUnsafe(
      `SELECT
        DATE_TRUNC('${resolution}', timestamp)::text AS bucket,
        COUNT(*)::int AS requests,
        ROUND(AVG(latency_ms)::numeric, 1)::float AS avg_latency_ms
      FROM request_logs
      WHERE service_id = $1 AND timestamp >= NOW() - INTERVAL '1 day' * $2
      GROUP BY bucket
      ORDER BY bucket ASC`,
      serviceId,
      days,
    );

    if (includeKeys && items.length > 0) {
      const keys: Array<{
        bucket: string;
        key_id: string;
        key_prefix: string;
        requests: number;
      }> = await this.prisma.$queryRawUnsafe(
        `SELECT
          DATE_TRUNC('${resolution}', rl.timestamp)::text AS bucket,
          rl.api_key_id AS key_id,
          COALESCE(ak.key_prefix, 'unknown') AS key_prefix,
          COUNT(*)::int AS requests
        FROM request_logs rl
        LEFT JOIN api_keys ak ON ak.id = rl.api_key_id
        WHERE rl.service_id = $1 AND rl.timestamp >= NOW() - INTERVAL '1 day' * $2
        GROUP BY bucket, rl.api_key_id, ak.key_prefix
        ORDER BY bucket ASC, requests DESC`,
        serviceId,
        days,
      );

      const keyMap = new Map<string, KeyBreakdown[]>();
      for (const k of keys) {
        const list = keyMap.get(k.bucket) ?? [];
        list.push({ key_id: k.key_id, key_prefix: k.key_prefix, requests: k.requests });
        keyMap.set(k.bucket, list);
      }

      for (const item of items) {
        item.keys = keyMap.get(item.bucket) ?? [];
      }
    }

    return { items };
  }

  async keyUsage(
    keyId: string,
    days: number,
    resolution: 'hour' | 'day',
  ): Promise<{ items: UsageBucket[] }> {
    this.validateResolution(resolution);

    const items: UsageBucket[] = await this.prisma.$queryRawUnsafe(
      `SELECT
        DATE_TRUNC('${resolution}', timestamp)::text AS bucket,
        COUNT(*)::int AS requests,
        ROUND(AVG(latency_ms)::numeric, 1)::float AS avg_latency_ms
      FROM request_logs
      WHERE api_key_id = $1 AND timestamp >= NOW() - INTERVAL '1 day' * $2
      GROUP BY bucket
      ORDER BY bucket ASC`,
      keyId,
      days,
    );

    return { items };
  }

  private validateResolution(resolution: string): asserts resolution is 'hour' | 'day' {
    if (resolution !== 'hour' && resolution !== 'day') {
      throw new BadRequestException('resolution must be "hour" or "day"');
    }
  }
}
