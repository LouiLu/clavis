import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';
import { PrismaService } from '../prisma.service';
import { ApiKeySecretService } from './api-key-secret.service';

export interface CreateApiKeyInput {
  name: string;
  expires_at?: string;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: ApiKeySecretService,
    private readonly audit: AuditLogService,
  ) {}

  async create(serviceId: string, actorUserId: string, input: CreateApiKeyInput) {
    const service = await this.findAccessibleService(serviceId, actorUserId);
    if (service.status !== 'active') {
      throw new NotFoundException('Backend service not found');
    }

    const generated = this.secrets.generate();
    const apiKey = await this.prisma.apiKey.create({
      data: {
        organizationId: service.organizationId,
        backendServiceId: service.id,
        name: input.name,
        keyPrefix: generated.prefix,
        keyHash: await this.secrets.hash(generated.plaintext),
        status: 'active',
        expiresAt: input.expires_at ? new Date(input.expires_at) : undefined,
        createdByUserId: actorUserId,
      },
      include: { backendService: true },
    });

    await this.audit.record({
      organizationId: apiKey.organizationId,
      actorUserId,
      action: 'api_key.created',
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { prefix: apiKey.keyPrefix, service_id: service.id },
    });

    return { apiKey, plaintext: generated.plaintext };
  }

  async listForService(serviceId: string, actorUserId: string) {
    await this.findAccessibleService(serviceId, actorUserId);
    return this.prisma.apiKey.findMany({
      where: { backendServiceId: serviceId },
      include: { backendService: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  get(keyId: string, actorUserId: string) {
    return this.findAccessibleKey(keyId, actorUserId);
  }

  async rotate(keyId: string, actorUserId: string) {
    const existing = await this.findAccessibleKey(keyId, actorUserId);
    const generated = this.secrets.generate();
    const apiKey = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: {
        keyPrefix: generated.prefix,
        keyHash: await this.secrets.hash(generated.plaintext),
        rotatedAt: new Date(),
        status: 'active',
      },
      include: { backendService: true },
    });
    await this.audit.record({
      organizationId: existing.organizationId,
      actorUserId,
      action: 'api_key.rotated',
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { prefix: apiKey.keyPrefix },
    });
    return { apiKey, plaintext: generated.plaintext };
  }

  async revoke(keyId: string, actorUserId: string) {
    const existing = await this.findAccessibleKey(keyId, actorUserId);
    const apiKey = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: 'revoked' },
      include: { backendService: true },
    });
    await this.audit.record({
      organizationId: existing.organizationId,
      actorUserId,
      action: 'api_key.revoked',
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { prefix: apiKey.keyPrefix },
    });
    return apiKey;
  }

  async delete(keyId: string, actorUserId: string) {
    const existing = await this.findAccessibleKey(keyId, actorUserId);
    await this.audit.record({
      organizationId: existing.organizationId,
      actorUserId,
      action: 'api_key.deleted',
      targetType: 'api_key',
      targetId: existing.id,
      metadata: { prefix: existing.keyPrefix },
    });
    await this.prisma.apiKey.delete({ where: { id: keyId } });
    return { ok: true };
  }

  private async findAccessibleService(serviceId: string, actorUserId: string) {
    const service = await this.prisma.backendService.findFirst({
      where: {
        id: serviceId,
        organization: {
          memberships: { some: { userId: actorUserId, status: 'active' } },
        },
      },
    });
    if (!service) {
      throw new NotFoundException('Backend service not found');
    }
    return service;
  }

  private async findAccessibleKey(keyId: string, actorUserId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: keyId,
        backendService: {
          organization: {
            memberships: { some: { userId: actorUserId, status: 'active' } },
          },
        },
      },
      include: { backendService: true },
    });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    return apiKey;
  }
}
