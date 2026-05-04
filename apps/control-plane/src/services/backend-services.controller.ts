import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { BackendService, RateLimitPolicy } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import {
  BackendServicesService,
  CreateBackendServiceInput,
  UpdateBackendServiceInput,
} from './backend-services.service';

@UseGuards(AuthGuard)
@Controller('v1/services')
export class BackendServicesController {
  constructor(private readonly services: BackendServicesService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: Partial<CreateBackendServiceInput>) {
    if (!body.organization_id || !body.name || !body.slug || !body.base_url || !body.allowed_routes) {
      throw new BadRequestException('organization_id, name, slug, base_url, and allowed_routes are required');
    }
    const service = await this.services.create(user.id, {
      organization_id: body.organization_id,
      name: body.name,
      slug: body.slug,
      base_url: body.base_url,
      allowed_routes: body.allowed_routes,
      upstream_auth_config: body.upstream_auth_config,
      default_rate_limit: body.default_rate_limit,
    });
    return this.serializeService(service);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const services = await this.services.list(user.id);
    return { items: services.map((service) => this.serializeService(service)) };
  }

  @Get(':serviceId')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('serviceId') serviceId: string) {
    return this.serializeService(await this.services.get(user.id, serviceId));
  }

  @Patch(':serviceId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateBackendServiceInput,
  ) {
    return this.serializeService(await this.services.update(user.id, serviceId, body));
  }

  @Delete(':serviceId')
  async disable(@CurrentUser() user: AuthenticatedUser, @Param('serviceId') serviceId: string) {
    return this.serializeService(await this.services.disable(user.id, serviceId));
  }

  private serializeService(service: BackendService & { rateLimitPolicies: RateLimitPolicy[] }) {
    const defaultRateLimit = service.rateLimitPolicies.find((policy) => policy.targetType === 'backend_service');
    return {
      id: service.id,
      organization_id: service.organizationId,
      name: service.name,
      slug: service.slug,
      base_url: service.baseUrl,
      allowed_routes: service.allowedRoutes,
      upstream_auth_config: service.upstreamAuthConfig,
      status: service.status,
      default_rate_limit: defaultRateLimit
        ? {
            requests_per_interval: defaultRateLimit.requestsPerInterval,
            interval_seconds: defaultRateLimit.intervalSeconds,
            burst_size: defaultRateLimit.burstSize,
          }
        : null,
      created_at: service.createdAt.toISOString(),
      updated_at: service.updatedAt.toISOString(),
    };
  }
}
