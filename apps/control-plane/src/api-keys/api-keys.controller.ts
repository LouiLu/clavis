import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiKey, BackendService } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ApiKeysService, CreateApiKeyInput, RateLimitInput } from './api-keys.service';

@UseGuards(AuthGuard)
@Controller()
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post('v1/services/:serviceId/api-keys')
  async create(
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Partial<CreateApiKeyInput>,
  ) {
    if (!body.name) {
      throw new BadRequestException('name is required');
    }
    const created = await this.apiKeys.create(serviceId, user.id, {
      name: body.name,
      expires_at: body.expires_at,
    });
    return {
      ...this.serializeApiKey(created.apiKey),
      api_key: created.plaintext,
    };
  }

  @Get('v1/services/:serviceId/api-keys')
  async listForService(@Param('serviceId') serviceId: string, @CurrentUser() user: AuthenticatedUser) {
    const apiKeys = await this.apiKeys.listForService(serviceId, user.id);
    return { items: apiKeys.map((apiKey) => this.serializeApiKey(apiKey)) };
  }

  @Get('v1/api-keys/:keyId')
  async get(@Param('keyId') keyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.serializeApiKey(await this.apiKeys.get(keyId, user.id));
  }

  @Post('v1/api-keys/:keyId/rotate')
  async rotate(@Param('keyId') keyId: string, @CurrentUser() user: AuthenticatedUser) {
    const rotated = await this.apiKeys.rotate(keyId, user.id);
    return {
      ...this.serializeApiKey(rotated.apiKey),
      api_key: rotated.plaintext,
    };
  }

  @Post('v1/api-keys/:keyId/revoke')
  async revoke(@Param('keyId') keyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.serializeApiKey(await this.apiKeys.revoke(keyId, user.id));
  }

  @Delete('v1/api-keys/:keyId')
  delete(@Param('keyId') keyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.apiKeys.delete(keyId, user.id);
  }

  @Patch('v1/api-keys/:keyId')
  async update(
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { name?: string; expires_at?: string | null },
  ) {
    return this.serializeApiKey(await this.apiKeys.update(keyId, user.id, body));
  }

  @Get('v1/api-keys/:keyId/rate-limit')
  async getKeyRateLimit(
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apiKeys.getRateLimit(keyId, user.id);
  }

  @Put('v1/api-keys/:keyId/rate-limit')
  async upsertKeyRateLimit(
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RateLimitInput,
  ) {
    return this.apiKeys.upsertRateLimit(keyId, user.id, body);
  }

  @Delete('v1/api-keys/:keyId/rate-limit')
  deleteKeyRateLimit(
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apiKeys.deleteRateLimit(keyId, user.id);
  }

  private serializeApiKey(apiKey: ApiKey & { backendService: BackendService }) {
    return {
      id: apiKey.id,
      organization_id: apiKey.organizationId,
      backend_service_id: apiKey.backendServiceId,
      backend_service_slug: apiKey.backendService.slug,
      name: apiKey.name,
      prefix: apiKey.keyPrefix,
      status: apiKey.status,
      expires_at: apiKey.expiresAt?.toISOString() ?? null,
      last_used_at: apiKey.lastUsedAt?.toISOString() ?? null,
      rotated_at: apiKey.rotatedAt?.toISOString() ?? null,
      created_at: apiKey.createdAt.toISOString(),
      updated_at: apiKey.updatedAt.toISOString(),
    };
  }
}
