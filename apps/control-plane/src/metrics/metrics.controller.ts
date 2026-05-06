import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MetricsService } from './metrics.service';

@Controller('v1/metrics')
@UseGuards(AuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.metrics.overview(parseDays(days, 7));
  }

  @Get('services/:serviceId/usage')
  serviceUsage(
    @Param('serviceId') serviceId: string,
    @Query('days') days?: string,
    @Query('resolution') resolution?: string,
    @Query('include_keys') includeKeys?: string,
  ) {
    return this.metrics.serviceUsage(
      serviceId,
      parseDays(days, 7),
      (resolution as 'hour' | 'day') || 'hour',
      includeKeys === 'true',
    );
  }

  @Get('keys/:keyId/usage')
  keyUsage(
    @Param('keyId') keyId: string,
    @Query('days') days?: string,
    @Query('resolution') resolution?: string,
  ) {
    return this.metrics.keyUsage(
      keyId,
      parseDays(days, 7),
      (resolution as 'hour' | 'day') || 'hour',
    );
  }
}

function parseDays(days: string | undefined, fallback: number): number {
  if (!days) return fallback;
  const n = parseInt(days, 10);
  if (isNaN(n) || n < 1) return fallback;
  return Math.min(n, 90);
}
