import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit/audit-log.service';
import { PrismaService } from '../prisma.service';

export interface RateLimitInput {
  requests_per_interval?: number;
  interval_seconds?: number;
  burst_size?: number;
}

export interface CreateBackendServiceInput {
  organization_id: string;
  name: string;
  slug: string;
  base_url: string;
  allowed_routes: Prisma.InputJsonValue;
  upstream_auth_config?: Prisma.InputJsonValue;
  default_rate_limit?: RateLimitInput;
}

export interface UpdateBackendServiceInput {
  name?: string;
  base_url?: string;
  allowed_routes?: Prisma.InputJsonValue;
  upstream_auth_config?: Prisma.InputJsonValue | null;
  status?: 'active' | 'disabled';
  default_rate_limit?: RateLimitInput;
}

@Injectable()
export class BackendServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async create(actorUserId: string, input: CreateBackendServiceInput) {
    const service = await this.prisma.backendService.create({
      data: {
        organizationId: input.organization_id,
        name: input.name,
        slug: input.slug,
        baseUrl: input.base_url,
        allowedRoutes: input.allowed_routes,
        upstreamAuthConfig: input.upstream_auth_config,
        createdByUserId: actorUserId,
        status: 'active',
      },
    });

    await this.upsertDefaultRateLimit(service.id, input.default_rate_limit);
    await this.audit.record({
      organizationId: service.organizationId,
      actorUserId,
      action: 'backend_service.created',
      targetType: 'backend_service',
      targetId: service.id,
      metadata: { slug: service.slug },
    });
    return this.get(actorUserId, service.id);
  }

  list(actorUserId: string) {
    return this.prisma.backendService.findMany({
      where: {
        organization: {
          memberships: { some: { userId: actorUserId, status: 'active' } },
        },
      },
      include: { rateLimitPolicies: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(actorUserId: string, serviceId: string) {
    const service = await this.prisma.backendService.findFirst({
      where: {
        id: serviceId,
        organization: {
          memberships: { some: { userId: actorUserId, status: 'active' } },
        },
      },
      include: { rateLimitPolicies: true },
    });
    if (!service) {
      throw new NotFoundException('Backend service not found');
    }
    return service;
  }

  async update(actorUserId: string, serviceId: string, input: UpdateBackendServiceInput) {
    const existing = await this.get(actorUserId, serviceId);
    const service = await this.prisma.backendService.update({
      where: { id: serviceId },
      data: {
        name: input.name,
        baseUrl: input.base_url,
        allowedRoutes: input.allowed_routes,
        upstreamAuthConfig:
          input.upstream_auth_config === null ? Prisma.JsonNull : input.upstream_auth_config,
        status: input.status,
      },
      include: { rateLimitPolicies: true },
    });

    if (input.default_rate_limit !== undefined) {
      await this.upsertDefaultRateLimit(service.id, input.default_rate_limit);
    }
    await this.audit.record({
      organizationId: existing.organizationId,
      actorUserId,
      action: 'backend_service.updated',
      targetType: 'backend_service',
      targetId: service.id,
      metadata: { slug: service.slug },
    });
    return this.get(actorUserId, service.id);
  }

  async deletePermanently(actorUserId: string, serviceId: string) {
    const existing = await this.get(actorUserId, serviceId);
    if (existing.status !== 'disabled') {
      throw new BadRequestException('Service must be disabled before permanent deletion');
    }
    await this.prisma.backendService.delete({ where: { id: serviceId } });
    await this.audit.record({
      organizationId: existing.organizationId,
      actorUserId,
      action: 'backend_service.deleted',
      targetType: 'backend_service',
      targetId: serviceId,
      metadata: { slug: existing.slug },
    });
    return { ok: true };
  }

  async disable(actorUserId: string, serviceId: string) {
    const existing = await this.get(actorUserId, serviceId);
    const service = await this.prisma.backendService.update({
      where: { id: serviceId },
      data: { status: 'disabled' },
      include: { rateLimitPolicies: true },
    });
    await this.audit.record({
      organizationId: existing.organizationId,
      actorUserId,
      action: 'backend_service.disabled',
      targetType: 'backend_service',
      targetId: service.id,
      metadata: { slug: service.slug },
    });
    return service;
  }

  private upsertDefaultRateLimit(serviceId: string, input?: RateLimitInput) {
    return this.prisma.rateLimitPolicy.upsert({
      where: {
        targetType_targetId: {
          targetType: 'backend_service',
          targetId: serviceId,
        },
      },
      update: {
        requestsPerInterval: input?.requests_per_interval ?? 1000,
        intervalSeconds: input?.interval_seconds ?? 60,
        burstSize: input?.burst_size ?? 100,
      },
      create: {
        targetType: 'backend_service',
        targetId: serviceId,
        backendServiceId: serviceId,
        requestsPerInterval: input?.requests_per_interval ?? 1000,
        intervalSeconds: input?.interval_seconds ?? 60,
        burstSize: input?.burst_size ?? 100,
      },
    });
  }
}
