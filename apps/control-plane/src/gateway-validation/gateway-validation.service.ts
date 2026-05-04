import { Injectable } from '@nestjs/common';
import { ApiKeySecretService } from '../api-keys/api-key-secret.service';
import { PrismaService } from '../prisma.service';

@Injectable()
export class GatewayValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: ApiKeySecretService,
  ) {}

  async validate(input: { api_key: string; service_slug: string; method?: string; path?: string }) {
    const prefix = input.api_key.split('.')[0];
    const record = await this.prisma.apiKey.findUnique({
      where: { keyPrefix: prefix },
      include: {
        organization: true,
        backendService: { include: { rateLimitPolicies: true } },
        rateLimitPolicies: true,
      },
    });
    if (!record || record.status !== 'active') {
      return { valid: false, reason: 'unknown_or_inactive_key' };
    }
    if (record.expiresAt && record.expiresAt <= new Date()) {
      return { valid: false, reason: 'expired_key' };
    }
    if (record.backendService.slug !== input.service_slug || record.backendService.status !== 'active') {
      return { valid: false, reason: 'service_not_allowed' };
    }
    const ok = await this.secrets.verify(record.keyHash, input.api_key);
    if (!ok) {
      return { valid: false, reason: 'invalid_key' };
    }

    await this.prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
    const keyLimit = record.rateLimitPolicies[0];
    const serviceLimit = record.backendService.rateLimitPolicies[0];
    const effectiveLimit = keyLimit ?? serviceLimit;
    return {
      valid: true,
      organization: { id: record.organization.id },
      api_key: { id: record.id, prefix: record.keyPrefix },
      backend_service: {
        id: record.backendService.id,
        slug: record.backendService.slug,
        base_url: record.backendService.baseUrl,
        allowed_routes: record.backendService.allowedRoutes,
      },
      rate_limit: effectiveLimit
        ? {
            requests_per_interval: effectiveLimit.requestsPerInterval,
            interval_seconds: effectiveLimit.intervalSeconds,
            burst_size: effectiveLimit.burstSize,
          }
        : null,
    };
  }
}
